// lib/builder/scaffold-worker.ts
import { Queue, Worker, type Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import { evaluatePathPolicy } from './path-policy';
import { evaluateReviewGate, parseReviewReport, type ReviewReport } from './review-gate';
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
    if (data?.proposalId) {
      void markProposalRunFailed(data.proposalId, err.message);
    }
  });

  worker.on('completed', (job) => {
    console.log(`[scaffold-worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

async function markProposalRunFailed(proposalId: string, message: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from('builder_proposals')
      .update({
        phase: 'failed',
        review_report: {
          score: 0,
          findings: [{ severity: 'error', description: `Run failed before review completed: ${message.slice(0, 500)}` }],
        },
      })
      .eq('id', proposalId);
  } catch (updateError) {
    console.error(`[scaffold-worker] Could not mark proposal ${proposalId} failed:`, updateError);
  }
}

async function runBuildPhase(data: ScaffoldBuildJobData): Promise<void> {
  const { proposalId } = data;
  const supabase = createAdminClient();

  const { data: proposal, error: fetchError } = await supabase
    .from('builder_proposals')
    .select('plan_content, generated_code, org_id')
    .eq('id', proposalId)
    .single();

  if (fetchError || !proposal) {
    throw new Error(`Proposal ${proposalId} not found`);
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'building' })
    .eq('id', proposalId);

  const planContent = proposal.plan_content as ScaffoldPlanContent | null;
  let generatedFiles: Array<{ path: string; content: string }>;

  if (planContent?.files?.length) {
    generatedFiles = await generateFilesFromPlan(supabase, proposalId, planContent);
  } else {
    // Generic proposals arrive with their files already attached; they skip
    // generation and go straight to policy check + review.
    const supplied = (proposal.generated_code as { files?: Array<{ path: string; content: string }> } | null)?.files ?? [];
    if (supplied.length === 0) {
      throw new Error(`Proposal ${proposalId} has no plan and no supplied files to review`);
    }
    generatedFiles = supplied;
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'build_ready' })
    .eq('id', proposalId);

  const policy = evaluatePathPolicy(generatedFiles.map(f => f.path));
  if (!policy.allowed) {
    const report: ReviewReport = {
      score: 0,
      findings: policy.violations.map(v => ({ severity: 'error', description: `Protected path ${v.path}: ${v.detail}` })),
    };
    await supabase
      .from('builder_proposals')
      .update({ phase: 'needs_repair', review_report: report })
      .eq('id', proposalId);
    return;
  }

  await runReviewPhase(proposalId, planContent, generatedFiles);
}

async function generateFilesFromPlan(
  supabase: ReturnType<typeof createAdminClient>,
  proposalId: string,
  planContent: ScaffoldPlanContent
): Promise<Array<{ path: string; content: string }>> {
  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);
  const systemPrompt = `You are a senior software engineer implementing a module for the ${branding.appName} platform.${contextPrompt}`;

  const provider = createAIProvider();
  const generatedFiles: Array<{ path: string; content: string }> = [];

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

    await supabase
      .from('builder_proposals')
      .update({ generated_code: { files: generatedFiles } })
      .eq('id', proposalId);
  }

  return generatedFiles;
}

async function runReviewPhase(
  proposalId: string,
  planContent: ScaffoldPlanContent | null,
  generatedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('builder_proposals')
    .update({ phase: 'reviewing' })
    .eq('id', proposalId);

  const provider = createAIProvider();

  const filesText = generatedFiles
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n');

  const planText = planContent
    ? JSON.stringify(planContent, null, 2)
    : 'No structured plan: this is a directly submitted code proposal. Review the files on their own merits.';

  const reviewPrompt = `Review this proposed implementation against the plan and ${branding.appName} codebase standards.

Module plan:
${planText}

Proposed files:
${filesText}

Check for:
1. Missing auth guards (org-scoped routes must check can_view_org, is_org_admin, user_org_role, or the implementation-reviewer capability as appropriate)
2. RLS policy gaps (every new table needs read/write/service_role policies)
3. Naming inconsistencies (slug, table names, component names must be consistent; org-scoped FK columns are org_id)
4. Type mismatches (TypeScript types should match DB column definitions)

Respond with ONLY a valid JSON object (no markdown fences):
{
  "score": 85,
  "findings": [
    { "severity": "error", "description": "..." },
    { "severity": "warning", "description": "..." }
  ]
}

Severity contract: use "error" for anything that must block a pull request (security, org isolation, RLS, schema canon violations, broken code). Use "warning" for improvements. The score is a summary only; it does not gate anything.`;

  const response = await provider.createMessage({
    model: AI_MODELS.scaffoldReview,
    maxTokens: 2048,
    messages: [{ role: 'user', content: reviewPrompt }],
    system: 'You are a senior code reviewer. Return only valid JSON.',
  });

  const textBlock = response.content.find(b => b.type === 'text');
  let reviewReport: ReviewReport = {
    score: 0,
    findings: [{ severity: 'error', description: 'Automated review produced no output. Retry the run before opening a PR.' }],
  };

  if (textBlock?.type === 'text') {
    try {
      const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
      const validated = parseReviewReport(JSON.parse(raw));
      reviewReport = validated ?? {
        score: 0,
        findings: [{ severity: 'error', description: 'Automated review returned a malformed report. Retry the run before opening a PR.' }],
      };
    } catch {
      reviewReport = {
        score: 0,
        findings: [{ severity: 'error', description: 'Automated review output could not be parsed. Retry the run before opening a PR.' }],
      };
    }
  }

  const gate = evaluateReviewGate(reviewReport);

  await supabase
    .from('builder_proposals')
    .update({ phase: gate.pass ? 'ready_to_apply' : 'needs_repair', review_report: reviewReport })
    .eq('id', proposalId);
}
