// lib/builder/scaffold-worker.ts
//
// Build worker for Builder code proposals (Increment 2 durable data contract).
// Consumes {proposalId, orgId, revisionId} jobs and records IMMUTABLE facts:
// a frozen revision (artifacts + hashes), a review attempt, and its findings.
// It never mutates the deleted phase/generated_code/review_report columns.
//
// Critical ordering invariant (migration 0025 immutability trigger): the
// revision's manifest/diff/context hashes and artifacts must be frozen BEFORE
// the first builder_review_attempts row for that revision is inserted — after
// that, the trigger rejects any change to those fields (ERRCODE P0031).
import { Queue, Worker, type Job } from 'bullmq';
import { createElevatedClient } from '@/lib/api/admin-client';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { evaluatePathPolicy, evaluateFileBudget } from './path-policy';
import { requiredCheckKeys } from './check-matrix';
import { runAndRecordVerification } from './verification';
import { createVerificationRunner } from './verification-runner';
import {
  transitionProposal,
  failInFlightRun,
  REVIEW_POLICY_VERSION,
  type CodeState,
  type RevisionRow,
  type ReviewAttemptRow,
  type FindingRow,
  type VerificationRunRow,
} from './proposal-state';
import {
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  canonicalJson,
  sha256Hex,
  capAndRedactLog,
  ARTIFACT_KEYS,
  putJsonArtifact,
  putTextArtifact,
  readJsonArtifact,
} from './artifacts';
import { evaluateAttemptGate, parseModelReviewOutput } from './review-gate';
import type { ScaffoldPlanContent } from './tools';
import { branding } from '@/lib/config';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const scaffoldQueue = new Queue('scaffold-jobs', { connection: redisConnection });

export interface ScaffoldBuildJobData {
  proposalId: string;
  orgId: string;
  revisionId: string;
}

interface ProposalFile {
  path: string;
  content: string;
  diff?: string;
}

export async function enqueueScaffoldBuildJob(data: ScaffoldBuildJobData): Promise<string> {
  const job = await scaffoldQueue.add('scaffold-build', data, {
    // Keying the BullMQ job by revisionId (the claim RPC's idempotency key)
    // means a duplicate enqueue for the same revision returns the existing
    // job instead of creating a second one.
    jobId: data.revisionId,
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  });
  return job.id ?? '';
}

export function createScaffoldWorker(): Worker {
  const worker = new Worker(
    'scaffold-jobs',
    async (job: Job) => {
      if (job.name === 'scaffold-build') {
        await runBuildPhase(job.data as ScaffoldBuildJobData);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[scaffold-worker] Job ${job?.id} failed:`, err.message);
    const data = job?.data as ScaffoldBuildJobData | undefined;
    if (data?.proposalId && data?.orgId) {
      void markProposalRunFailed(data.proposalId, data.orgId, err.message);
    }
  });

  worker.on('completed', (job) => {
    console.log(`[scaffold-worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

// ============================================================
// Build phase
// ============================================================

export async function runBuildPhase(data: ScaffoldBuildJobData): Promise<void> {
  const { proposalId, orgId, revisionId } = data;
  const supabase = createElevatedClient();

  // ── Step 1: load + re-entry guard ────────────────────────────────────────
  const { data: proposal, error: proposalError } = await supabase
    .from('builder_proposals')
    .select('id, org_id, code_state, current_revision_id, plan_content')
    .eq('id', proposalId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (proposalError) throw proposalError;

  if (!proposal || proposal.code_state !== 'queued' || proposal.current_revision_id !== revisionId) {
    // Idempotent re-entry: a duplicate delivery, a stale job, or a run already
    // claimed by another worker. Exit cleanly with zero writes.
    console.log(
      `[scaffold-worker] Skipping build for proposal ${proposalId} revision ${revisionId}: ` +
        `state=${proposal?.code_state ?? 'missing'} current_revision=${proposal?.current_revision_id ?? 'none'}`
    );
    return;
  }

  const { data: revision, error: revisionError } = await supabase
    .from('builder_proposal_revisions')
    .select('*')
    .eq('id', revisionId)
    .maybeSingle();
  if (revisionError) throw revisionError;
  if (!revision) {
    console.log(`[scaffold-worker] Revision ${revisionId} not found for proposal ${proposalId}; exiting.`);
    return;
  }

  const planContent = proposal.plan_content as ScaffoldPlanContent | null;
  const prefix: string = revision.artifact_prefix;

  let files: ProposalFile[];
  // Hashes that the review gate needs. For scaffold we compute + freeze them
  // here; for generic proposals they were frozen at submission time.
  let gateRevision: RevisionRow = revision as RevisionRow;
  let budgetError: string | null = null;

  if (planContent && Array.isArray(planContent.files) && planContent.files.length > 0) {
    // ── Scaffold path ──────────────────────────────────────────────────────
    await transition(supabase, proposalId, orgId, 'queued', 'generating');

    files = await generateFilesFromPlan(supabase, revisionId, planContent);

    // Step 3: policy + budget are evaluated here, but the decision (which
    // needs an attempt row to hang findings off) is deferred to step 5.
    budgetError = evaluateFileBudget(files);

    // Freeze artifacts + hashes on the revision BEFORE any attempt exists.
    const manifestInput = files.map(f => ({ path: f.path, content: f.content }));
    const manifest = buildFileManifest(manifestInput);
    const diffText = buildUnifiedDiff(manifestInput);
    const contextPayload = {
      request_text: (planContent as { moduleName?: string }).moduleName ?? '',
      files: manifest.entries.map(e => e.path),
    };
    const mHash = manifestHash(manifest);
    const dHash = sha256Hex(diffText);
    const cHash = sha256Hex(canonicalJson(contextPayload));

    await putJsonArtifact(supabase, `${prefix}/${ARTIFACT_KEYS.files}`, {
      files: files.map(f => ({ path: f.path, content: f.content, diff: f.diff ?? '' })),
    });
    await putJsonArtifact(supabase, `${prefix}/${ARTIFACT_KEYS.manifest}`, manifest);
    await putTextArtifact(supabase, `${prefix}/${ARTIFACT_KEYS.diff}`, diffText, 'text/x-diff');
    await putJsonArtifact(supabase, `${prefix}/${ARTIFACT_KEYS.context}`, contextPayload);

    const { error: stampError } = await supabase
      .from('builder_proposal_revisions')
      .update({
        manifest_hash: mHash,
        diff_hash: dHash,
        context_hash: cHash,
        file_count: manifest.fileCount,
        total_bytes: manifest.totalBytes,
      })
      .eq('id', revisionId);
    if (stampError) throw stampError;

    gateRevision = {
      ...(revision as RevisionRow),
      manifest_hash: mHash,
      diff_hash: dHash,
      context_hash: cHash,
      file_count: manifest.fileCount,
      total_bytes: manifest.totalBytes,
    };

    await transition(supabase, proposalId, orgId, 'generating', 'verifying');
  } else {
    // ── Generic path ───────────────────────────────────────────────────────
    await transition(supabase, proposalId, orgId, 'queued', 'verifying');

    const stored = await readJsonArtifact<{ files: ProposalFile[] }>(
      supabase,
      `${prefix}/${ARTIFACT_KEYS.files}`
    );
    files = stored?.files ?? [];
    if (files.length === 0) {
      throw new Error(`Proposal ${proposalId} revision ${revisionId} has no files.json to review`);
    }
  }

  // ── Step 4: insert the review attempt (revision is now frozen) ────────────
  const { data: latestAttempt } = await supabase
    .from('builder_review_attempts')
    .select('attempt_number')
    .eq('revision_id', revisionId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const attemptNumber = (latestAttempt?.attempt_number ?? 0) + 1;
  const trigger = attemptNumber === 1 ? 'initial' : 'retry';

  // The change-class classifier derives which verify:* checks this proposal
  // must pass. Computed ONCE here and reused verbatim for the attempt row, the
  // verification run (Step 5.5), and the gate input (Step 7) — no drift between
  // what was recorded and what is enforced.
  const attemptRequiredKeys = requiredCheckKeys(files.map(f => f.path));

  const { data: attemptRow, error: attemptError } = await supabase
    .from('builder_review_attempts')
    .insert({
      proposal_id: proposalId,
      revision_id: revisionId,
      attempt_number: attemptNumber,
      trigger,
      status: 'running',
      policy_version: REVIEW_POLICY_VERSION,
      required_check_keys: attemptRequiredKeys,
    })
    .select('id')
    .single();
  if (attemptError) throw attemptError;
  const attemptId = attemptRow.id as string;

  // ── Step 5: path policy / budget violations block before review ───────────
  const policy = evaluatePathPolicy(files.map(f => f.path));
  if (!policy.allowed || budgetError) {
    const findingRows = policy.violations.map(v => ({
      review_attempt_id: attemptId,
      reviewer_kind: 'system',
      severity: 'blocker',
      category: 'path-policy',
      rule_id: v.rule,
      file_path: v.path,
      evidence: v.detail,
      state: 'open',
    }));
    if (budgetError) {
      findingRows.push({
        review_attempt_id: attemptId,
        reviewer_kind: 'system',
        severity: 'blocker',
        category: 'file-budget',
        rule_id: 'file-budget',
        file_path: null as unknown as string,
        evidence: budgetError,
        state: 'open',
      });
    }
    const { error: findingsError } = await supabase.from('builder_review_findings').insert(findingRows);
    if (findingsError) throw findingsError;

    const reason = 'Proposal touches protected paths or exceeds the file budget.';
    await completeAttempt(supabase, attemptId, 'blocked', reason);
    await transition(supabase, proposalId, orgId, 'verifying', 'needs_repair');
    return;
  }

  // ── Step 5.5: deterministic verification (audit Phase 2 — before any AI review) ──
  const verification = await runAndRecordVerification(supabase, {
    orgId, proposalId, revisionId, attemptId,
    files, baseSha: revision.base_commit_sha,
    requiredKeys: attemptRequiredKeys,           // same array recorded on the attempt
    runner: createVerificationRunner(),
  });
  if (verification.setupFindings.length > 0) {
    const { error: setupFindingsError } = await supabase.from('builder_review_findings').insert(
      verification.setupFindings.map(f => ({ ...f, review_attempt_id: attemptId }))
    );
    if (setupFindingsError) throw setupFindingsError;
  }
  if (verification.authoritativeDiff) {
    gateRevision = {
      ...gateRevision,
      authoritative_diff_hash: verification.authoritativeDiff.hash,
      authoritative_diff_artifact_key: verification.authoritativeDiff.artifactKey,
    };
  }
  // Do NOT branch on verification results here — Step 6 (model review) still runs,
  // and Step 7's evaluateAttemptGate is the sole authority on pass/blocked.

  // ── Step 6: single-model automated review ─────────────────────────────────
  const { promptText, rawResponse } = await runModelReview(
    planContent ?? null,
    verification.authoritativeDiff?.text ?? null
  );

  await putTextArtifact(supabase, `${prefix}/${ARTIFACT_KEYS.reviewPrompt(attemptId)}`, promptText);
  await putTextArtifact(
    supabase,
    `${prefix}/${ARTIFACT_KEYS.reviewResponse(attemptId)}`,
    capAndRedactLog(rawResponse, 200_000),
    'application/json'
  );

  const parsed = parseReview(rawResponse);
  if (!parsed) {
    // Infrastructure failure — NOT a review verdict. Never synthesize a
    // finding; a null parse means the reviewer output is unusable.
    await completeAttempt(supabase, attemptId, 'failed', 'Model review output invalid');
    await transition(supabase, proposalId, orgId, 'verifying', 'failed');
    return;
  }

  if (parsed.findings.length > 0) {
    const { error: findingsError } = await supabase.from('builder_review_findings').insert(
      parsed.findings.map(f => ({
        review_attempt_id: attemptId,
        reviewer_kind: 'automated_review',
        severity: f.severity,
        category: f.category,
        rule_id: null,
        file_path: f.file_path,
        line_start: f.line_start,
        line_end: f.line_end,
        evidence: f.evidence,
        recommendation: f.recommendation,
        state: 'open',
      }))
    );
    if (findingsError) throw findingsError;
  }

  // ── Step 7: re-load findings/runs and let the gate decide ─────────────────
  const { data: findings } = await supabase
    .from('builder_review_findings')
    .select('*')
    .eq('review_attempt_id', attemptId);
  const { data: verificationRuns } = await supabase
    .from('builder_verification_runs')
    .select('*')
    .eq('review_attempt_id', attemptId);

  const nowIso = new Date().toISOString();
  const attemptForGate: ReviewAttemptRow = {
    id: attemptId,
    proposal_id: proposalId,
    revision_id: revisionId,
    attempt_number: attemptNumber,
    trigger,
    status: 'passed', // hypothesis — the gate confirms or rejects it
    policy_version: REVIEW_POLICY_VERSION,
    required_check_keys: attemptRequiredKeys,
    summary_score: parsed.summaryScore,
    started_at: nowIso,
    completed_at: nowIso,
    decision_reason: null,
  };

  const gate = evaluateAttemptGate({
    proposal: { code_state: 'verifying', current_revision_id: revisionId },
    revision: gateRevision,
    attempt: attemptForGate,
    findings: (findings ?? []) as FindingRow[],
    verificationRuns: (verificationRuns ?? []) as VerificationRunRow[],
    currentPolicyVersion: REVIEW_POLICY_VERSION,
  });

  if (gate.pass) {
    await completeAttempt(supabase, attemptId, 'passed', 'All gates passed', parsed.summaryScore);
    await transition(supabase, proposalId, orgId, 'verifying', 'ready_to_apply');
  } else {
    await completeAttempt(supabase, attemptId, 'blocked', gate.reason ?? 'Review gate failed', parsed.summaryScore);
    await transition(supabase, proposalId, orgId, 'verifying', 'needs_repair');
  }
}

// ============================================================
// Failure handling
// ============================================================

export async function markProposalRunFailed(proposalId: string, orgId: string, message: string): Promise<void> {
  try {
    const supabase = createElevatedClient();

    // Complete the latest still-running attempt (if any) so it isn't stranded.
    const { data: running } = await supabase
      .from('builder_review_attempts')
      .select('id')
      .eq('proposal_id', proposalId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (running?.id) {
      await supabase
        .from('builder_review_attempts')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          decision_reason: 'Run failed before review completed',
        })
        .eq('id', running.id);

      await supabase.from('builder_review_findings').insert({
        review_attempt_id: running.id,
        reviewer_kind: 'system',
        severity: 'error',
        category: 'infrastructure',
        evidence: capAndRedactLog(`Run failed before review completed: ${message}`, 10_000),
        state: 'open',
      });
    }

    await failInFlightRun(supabase, proposalId);
  } catch (updateError) {
    console.error(`[scaffold-worker] Could not mark proposal ${proposalId} failed:`, updateError);
  }
}

// ============================================================
// Helpers
// ============================================================

async function transition(
  supabase: ReturnType<typeof createElevatedClient>,
  proposalId: string,
  orgId: string,
  from: CodeState,
  to: CodeState
): Promise<void> {
  const result = await transitionProposal(supabase, { proposalId, orgId, from, to });
  if (!result.ok) {
    throw new Error(
      `Builder transition ${from}->${to} failed for proposal ${proposalId} (current: ${result.currentState})`
    );
  }
}

async function completeAttempt(
  supabase: ReturnType<typeof createElevatedClient>,
  attemptId: string,
  status: 'passed' | 'blocked' | 'failed',
  decisionReason: string,
  summaryScore?: number | null
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
    decision_reason: decisionReason,
  };
  if (summaryScore !== undefined) patch.summary_score = summaryScore;
  const { error } = await supabase.from('builder_review_attempts').update(patch).eq('id', attemptId);
  if (error) throw error;
}

async function generateFilesFromPlan(
  supabase: ReturnType<typeof createElevatedClient>,
  revisionId: string,
  planContent: ScaffoldPlanContent
): Promise<ProposalFile[]> {
  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);
  const systemPrompt = `You are a senior software engineer implementing a module for the ${branding.appName} platform.${contextPrompt}`;

  const provider = createAIProvider();
  const generatedFiles: ProposalFile[] = [];
  const progress: Array<{ path: string; done: boolean }> = [];

  for (const file of planContent.files) {
    const userPrompt = `Module plan:\n${JSON.stringify(planContent, null, 2)}\n\nImplement this specific file: ${file.path}\n${file.description}\n\nReturn ONLY the complete file content with no explanation or markdown fences.`;

    const response = await provider.createMessage({
      model: AI_MODELS.scaffoldBuild,
      maxTokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';
    generatedFiles.push({ path: file.path, content });
    progress.push({ path: file.path, done: true });

    // Incremental progress is allowed pre-attempt (the immutability trigger
    // only freezes `progress` once an attempt row exists).
    await supabase
      .from('builder_proposal_revisions')
      .update({ progress: { files: [...progress] } })
      .eq('id', revisionId);
  }

  return generatedFiles;
}

async function runModelReview(
  planContent: ScaffoldPlanContent | null,
  authoritativeDiff: string | null
): Promise<{ promptText: string; rawResponse: string }> {
  const provider = createAIProvider();

  const planText = planContent
    ? JSON.stringify(planContent, null, 2)
    : 'No structured plan: this is a directly submitted code proposal. Review the files on their own merits.';

  const promptText = `Review this proposed implementation against the plan and ${branding.appName} codebase standards.

Module plan:
${planText}

Authoritative implementation diff (produced from the pinned base commit):
${authoritativeDiff ?? 'No authoritative diff was produced. Treat this as a blocking verification failure.'}

Check for:
1. Missing auth guards (org-scoped routes must check can_view_org, is_org_admin, user_org_role, or the implementation-reviewer capability as appropriate)
2. RLS policy gaps (every new table needs read/write/service_role policies)
3. Naming inconsistencies (slug, table names, component names must be consistent; org-scoped FK columns are org_id)
4. Type mismatches (TypeScript types should match DB column definitions)

Respond with ONLY a valid JSON object (no markdown fences):
{
  "summary_score": 85,
  "findings": [
    { "severity": "error", "category": "security", "file_path": "app/api/...", "line_start": 1, "line_end": 1, "evidence": "...", "recommendation": "..." }
  ]
}

Severity contract: use "blocker" or "error" for anything that must block a pull request (security, org isolation, RLS, schema canon violations, broken code). Use "warning"/"info" for improvements. The summary_score is a summary only; it does not gate anything.`;

  const response = await provider.createMessage({
    model: AI_MODELS.scaffoldReview,
    maxTokens: 2048,
    messages: [{ role: 'user', content: promptText }],
    system: 'You are a senior code reviewer. Return only valid JSON.',
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const rawResponse = textBlock?.type === 'text' ? textBlock.text : '';
  return { promptText, rawResponse };
}

function parseReview(rawResponse: string): ReturnType<typeof parseModelReviewOutput> {
  if (!rawResponse) return null;
  try {
    const stripped = rawResponse.replace(/^```json?\n?|```$/gm, '').trim();
    return parseModelReviewOutput(JSON.parse(stripped));
  } catch {
    return null;
  }
}
