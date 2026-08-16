// @vitest-environment node
//
// Task 7 — worker rewrite (durable data contract). The worker records
// immutable revisions, review attempts, and findings rather than mutating the
// deleted phase/generated_code/review_report columns. These tests drive
// runBuildPhase / markProposalRunFailed directly against the shared Supabase
// mock, asserting the exact state sequence and — critically — the WRITE ORDER
// (artifacts + hashes frozen on the revision strictly BEFORE the first review
// attempt row is inserted, so the DB immutability trigger never rejects a
// post-attempt hash change).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseMock } from './helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Never touch a real Redis / BullMQ during unit tests.
vi.mock('bullmq', () => ({
  Queue: class {
    add = vi.fn(async () => ({ id: 'job-1' }));
  },
  Worker: class {
    on = vi.fn();
  },
}));

// createElevatedClient() is called inside the worker — hand it the test's mock.
let currentAdmin: any = null;
vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: () => currentAdmin,
}));

// The AI provider is stubbed by a FIFO queue of text responses.
let aiQueue: string[] = [];
// Recorded so tests can assert on what actually reaches the model, not just on
// what comes back from it.
let aiPrompts: string[] = [];
vi.mock('@/lib/ai/factory', () => ({
  createAIProvider: () => ({
    createMessage: vi.fn(async (request: any) => {
      aiPrompts.push(JSON.stringify(request));
      return {
        content: [{ type: 'text', text: aiQueue.shift() ?? '' }],
        stopReason: null,
        model: 'test-model',
      };
    }),
    createStream: vi.fn(),
  }),
}));

// Deterministic verification is stubbed here (Task 6 wires it into the worker
// between path-policy and model review). The real runner + persistence are
// exercised in verification.test.ts / verification-runner.test.ts; these tests
// assert the WORKER invokes it in the right ORDER and feeds the gate the same
// required-check-keys it recorded on the attempt.
const { runAndRecordVerificationMock } = vi.hoisted(() => ({
  runAndRecordVerificationMock: vi.fn(),
}));
vi.mock('@/lib/builder/verification', () => ({
  runAndRecordVerification: runAndRecordVerificationMock,
}));

import { runBuildPhase, markProposalRunFailed } from '@/lib/builder/scaffold-worker';
import { REVIEW_POLICY_VERSION } from '@/lib/builder/proposal-state';
import { requiredCheckKeys } from '@/lib/builder/check-matrix';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SCAFFOLD_PLAN = {
  moduleName: 'Volunteer Tracking',
  moduleSlug: 'volunteer_tracking',
  moduleIcon: 'users',
  tables: [],
  files: [{ path: 'lib/volunteer/service.ts', description: 'Volunteer service' }],
  registryEntry: '',
  apiShape: '',
};

function baseProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    org_id: ORG_ID,
    code_state: 'queued',
    current_revision_id: REVISION_ID,
    plan_content: null,
    ...overrides,
  };
}

function baseRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: REVISION_ID,
    proposal_id: PROPOSAL_ID,
    revision_number: 1,
    artifact_prefix: `${ORG_ID}/${PROPOSAL_ID}/${REVISION_ID}`,
    manifest_hash: null,
    diff_hash: null,
    authoritative_diff_hash: null,
    authoritative_diff_artifact_key: null,
    context_hash: null,
    file_count: null,
    total_bytes: null,
    progress: null,
    ...overrides,
  };
}

const REVIEW_PASS = JSON.stringify({ summary_score: 92, findings: [] });

// The three checks every proposal requires regardless of change class.
const DEFAULT_REQUIRED = ['verify:types', 'verify:lint', 'verify:unit'];

// verify:* run rows the gate will treat as satisfied (status 'passed').
function passedRuns(keys: string[]) {
  return keys.map((check_key, i) => ({
    id: `run-${i}`,
    review_attempt_id: ATTEMPT_ID,
    check_key,
    status: 'passed',
  }));
}

// Helpers to read the recorded call log.
function proposalStates(mock: SupabaseMock): string[] {
  return mock.calls
    .filter(c => c.table === 'builder_proposals' && c.method === 'update')
    .map(c => (c.args[0] as any).code_state);
}
function idxOf(mock: SupabaseMock, pred: (c: any) => boolean): number {
  return mock.calls.findIndex(pred);
}

beforeEach(() => {
  aiQueue = [];
  aiPrompts = [];
  currentAdmin = null;
  runAndRecordVerificationMock.mockReset();
  // Default: verification set up cleanly, all required checks passed. Individual
  // tests override this to simulate setup failures or failing checks.
  runAndRecordVerificationMock.mockResolvedValue({
    setupFindings: [],
    allRequiredPassed: true,
    authoritativeDiff: {
      hash: 'authoritative-diff-hash',
      artifactKey: `${ORG_ID}/${PROPOSAL_ID}/${REVISION_ID}/diff.authoritative.patch`,
      text: 'diff --git a/lib/volunteer/service.ts b/lib/volunteer/service.ts\n+new file mode 100644',
    },
  });
});

// ── Scaffold happy path ──────────────────────────────────────────────────────

describe('runBuildPhase — scaffold happy path', () => {
  function setup() {
    const mock = new SupabaseMock();
    // proposal load, then three transitions (queued→generating→verifying→ready_to_apply)
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: SCAFFOLD_PLAN }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'generating' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'ready_to_apply' }, error: null });
    // revision load, per-file progress update, hash stamp
    mock.queueTable('builder_proposal_revisions', { data: baseRevision(), error: null });
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // progress
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // hash stamp
    // attempt count read (none), attempt insert, final status update
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // latest attempt count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // final status update
    // gate re-load: findings + verification runs (verification is stubbed, so the
    // Step 7 re-load must supply the passed runs the recorded gate expects)
    mock.queueTable('builder_review_findings', { data: [], error: null });
    mock.queueTable('builder_verification_runs', { data: passedRuns(DEFAULT_REQUIRED), error: null });
    // artifacts: files, manifest, diff, context + review prompt, response
    for (let i = 0; i < 6; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = ['export const service = 1;', REVIEW_PASS];
    currentAdmin = mock.client();
    return mock;
  }

  it('walks queued→generating→verifying→ready_to_apply in order', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    expect(proposalStates(mock)).toEqual(['generating', 'verifying', 'ready_to_apply']);
  });

  it('freezes artifacts + revision hashes BEFORE inserting the review attempt', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const firstUpload = idxOf(mock, c => c.method === 'storage.upload');
    const hashStamp = idxOf(
      mock,
      c => c.table === 'builder_proposal_revisions' && c.method === 'update' && (c.args[0] as any).manifest_hash
    );
    const attemptInsert = idxOf(mock, c => c.table === 'builder_review_attempts' && c.method === 'insert');

    expect(firstUpload).toBeGreaterThanOrEqual(0);
    expect(hashStamp).toBeGreaterThanOrEqual(0);
    expect(attemptInsert).toBeGreaterThanOrEqual(0);
    expect(firstUpload).toBeLessThan(attemptInsert);
    expect(hashStamp).toBeLessThan(attemptInsert);
  });

  it('stamps manifest/diff/context hashes and counts on the revision', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    const stamp = mock.calls.find(
      c => c.table === 'builder_proposal_revisions' && c.method === 'update' && (c.args[0] as any).manifest_hash
    );
    const payload = stamp!.args[0] as Record<string, unknown>;
    expect(payload.manifest_hash).toEqual(expect.any(String));
    expect(payload.diff_hash).toEqual(expect.any(String));
    expect(payload.context_hash).toEqual(expect.any(String));
    expect(payload.file_count).toBe(1);
    expect(typeof payload.total_bytes).toBe('number');
  });

  it('inserts the initial attempt with policy version and classifier-derived required checks', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    const insert = mock.calls.find(c => c.table === 'builder_review_attempts' && c.method === 'insert');
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload.attempt_number).toBe(1);
    expect(payload.trigger).toBe('initial');
    expect(payload.policy_version).toBe(REVIEW_POLICY_VERSION);
    // SCAFFOLD_PLAN touches lib/volunteer/service.ts → types/lint/unit only (no build/migrations).
    expect(payload.required_check_keys).toEqual(requiredCheckKeys(['lib/volunteer/service.ts']));
    expect(payload.required_check_keys).toEqual(['verify:types', 'verify:lint', 'verify:unit']);
    expect(payload.revision_id).toBe(REVISION_ID);
  });

  it('marks the attempt passed and never inserts findings on a clean review', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    const finalUpdate = mock.calls
      .filter(c => c.table === 'builder_review_attempts' && c.method === 'update')
      .map(c => c.args[0] as any)
      .find(v => v.status);
    expect(finalUpdate.status).toBe('passed');
    expect(finalUpdate.completed_at).toEqual(expect.any(String));
    expect(mock.calls.some(c => c.table === 'builder_review_findings' && c.method === 'insert')).toBe(false);
  });
});

// ── Deterministic verification wiring (Increment 3) ──────────────────────────

describe('runBuildPhase — deterministic verification (Increment 3)', () => {
  // Generic-path scaffolding shared by the ordering / failing-check / setup-failure
  // cases. `verificationRuns` is the Step 7 re-load; `finalProposalState` is the
  // last proposals transition queued (ready_to_apply | needs_repair).
  function genericSetup(opts: {
    finalProposalState: string;
    verificationRuns: unknown[];
    findingsReload?: unknown[];
    findingsInsertResult?: boolean; // queue an extra findings-insert response (Step 5.5)
  }) {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: null }), error: null }); // load
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null }); // queued→verifying
    mock.queueTable('builder_proposals', { data: { code_state: opts.finalProposalState }, error: null }); // verifying→final
    mock.queueTable('builder_proposal_revisions', {
      data: baseRevision({ manifest_hash: 'm', diff_hash: 'd', base_commit_sha: 'basesha000' }),
      error: null,
    });
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // final status update
    if (opts.findingsInsertResult) {
      mock.queueTable('builder_review_findings', { data: null, error: null }); // Step 5.5 setup-finding insert
    }
    mock.queueTable('builder_review_findings', { data: opts.findingsReload ?? [], error: null }); // Step 7 re-load
    mock.queueTable('builder_verification_runs', { data: opts.verificationRuns, error: null }); // Step 7 re-load
    mock.queueStorageDownload('builder-artifacts', {
      data: JSON.stringify({ files: [{ path: 'lib/foo/bar.ts', content: 'export const x = 1;', diff: '' }] }),
      error: null,
    });
    for (let i = 0; i < 2; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });
    aiQueue = [REVIEW_PASS];
    currentAdmin = mock.client();
    return mock;
  }

  it('caps a huge authoritative diff so review degrades instead of failing on context length', async () => {
    // A proposal touching a large generated file (lib/database.types.ts, say)
    // produces a multi-megabyte diff. Interpolating it whole turns a reviewable
    // proposal into a hard run failure.
    const hugeDiff = `diff --git a/lib/database.types.ts b/lib/database.types.ts\n${'+'.repeat(2_000_000)}`;
    genericSetup({
      finalProposalState: 'ready_to_apply',
      verificationRuns: passedRuns(DEFAULT_REQUIRED),
    });
    runAndRecordVerificationMock.mockResolvedValue({
      setupFindings: [],
      allRequiredPassed: true,
      authoritativeDiff: {
        hash: 'huge-diff-hash',
        artifactKey: `${ORG_ID}/${PROPOSAL_ID}/${REVISION_ID}/diff.authoritative.patch`,
        text: hugeDiff,
      },
    });

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const reviewPrompt = aiPrompts.find(prompt => prompt.includes('Authoritative implementation diff'));
    expect(reviewPrompt).toBeDefined();
    expect(Buffer.byteLength(reviewPrompt!, 'utf8')).toBeLessThan(hugeDiff.length);
    expect(reviewPrompt).toContain('truncated');
  });

  it('runs verification AFTER the attempt insert and BEFORE model review, feeding it the attempt keys', async () => {
    const mock = genericSetup({ finalProposalState: 'ready_to_apply', verificationRuns: passedRuns(DEFAULT_REQUIRED) });

    let callsAtVerify = -1;
    runAndRecordVerificationMock.mockImplementation(async () => {
      callsAtVerify = mock.calls.length; // number of DB calls recorded before verification ran
      return { setupFindings: [], allRequiredPassed: true };
    });

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const attemptInsertIdx = mock.calls.findIndex(c => c.table === 'builder_review_attempts' && c.method === 'insert');
    const firstReviewUploadIdx = mock.calls.findIndex(c => c.method === 'storage.upload'); // generic path: first upload is the review prompt
    expect(attemptInsertIdx).toBeGreaterThanOrEqual(0);
    expect(firstReviewUploadIdx).toBeGreaterThanOrEqual(0);
    expect(callsAtVerify).toBeGreaterThan(attemptInsertIdx); // verification ran after the attempt row existed
    expect(firstReviewUploadIdx).toBeGreaterThanOrEqual(callsAtVerify); // model-review artifacts written after verification

    expect(runAndRecordVerificationMock).toHaveBeenCalledTimes(1);
    const arg = runAndRecordVerificationMock.mock.calls[0][1] as Record<string, any>;
    expect(arg).toMatchObject({
      orgId: ORG_ID,
      proposalId: PROPOSAL_ID,
      revisionId: REVISION_ID,
      attemptId: ATTEMPT_ID,
      baseSha: 'basesha000',
      requiredKeys: DEFAULT_REQUIRED, // same array recorded on the attempt row
    });
    expect(arg.runner).toBeDefined();
    expect(Array.isArray(arg.files)).toBe(true);
    expect(arg.files[0].path).toBe('lib/foo/bar.ts');
  });

  it('records classifier-derived required_check_keys including verify:migrations for a migration file', async () => {
    const MIGRATION_PLAN = {
      ...SCAFFOLD_PLAN,
      files: [
        { path: 'db/migrations/0099_volunteer_scaffold.sql', description: 'volunteer schema' },
        { path: 'lib/database.types.ts', description: 'regenerated schema types' },
      ],
    };
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: MIGRATION_PLAN }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'generating' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'ready_to_apply' }, error: null });
    mock.queueTable('builder_proposal_revisions', { data: baseRevision(), error: null });
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // progress
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // second-file progress
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // hash stamp
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // final update
    mock.queueTable('builder_review_findings', { data: [], error: null });
    const migrationKeys = ['verify:types', 'verify:lint', 'verify:unit', 'verify:migrations'];
    mock.queueTable('builder_verification_runs', { data: passedRuns(migrationKeys), error: null });
    for (let i = 0; i < 7; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });
    aiQueue = ['-- migration sql', 'export type Database = {};', REVIEW_PASS];
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const insert = mock.calls.find(c => c.table === 'builder_review_attempts' && c.method === 'insert');
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload.required_check_keys).toEqual(
      requiredCheckKeys(['db/migrations/0099_volunteer_scaffold.sql', 'lib/database.types.ts'])
    );
    expect(payload.required_check_keys).toContain('verify:migrations');
    // The gate is fed the SAME keys that were recorded — the run passes.
    expect(proposalStates(mock)).toEqual(['generating', 'verifying', 'ready_to_apply']);
    const verifyArg = runAndRecordVerificationMock.mock.calls[0][1] as Record<string, any>;
    expect(verifyArg.requiredKeys).toEqual(payload.required_check_keys);
  });

  it('blocks the attempt and moves to needs_repair when a required check has not passed', async () => {
    // A failing CHECK is not a setup failure: no setupFindings, but the Step 7
    // verification-run re-load reports verify:types as failed, so the real gate
    // fails on the required-checks clause.
    runAndRecordVerificationMock.mockResolvedValue({
      setupFindings: [],
      allRequiredPassed: false,
      authoritativeDiff: {
        hash: 'authoritative-diff-hash',
        artifactKey: `${ORG_ID}/${PROPOSAL_ID}/${REVISION_ID}/diff.authoritative.patch`,
        text: 'diff --git a/lib/volunteer/service.ts b/lib/volunteer/service.ts',
      },
    });
    const mock = genericSetup({
      finalProposalState: 'needs_repair',
      verificationRuns: [
        { id: 'r0', review_attempt_id: ATTEMPT_ID, check_key: 'verify:types', status: 'failed' },
        { id: 'r1', review_attempt_id: ATTEMPT_ID, check_key: 'verify:lint', status: 'passed' },
        { id: 'r2', review_attempt_id: ATTEMPT_ID, check_key: 'verify:unit', status: 'passed' },
      ],
    });

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const blocked = mock.calls
      .filter(c => c.table === 'builder_review_attempts' && c.method === 'update')
      .map(c => c.args[0] as any)
      .find(v => v.status);
    expect(blocked.status).toBe('blocked');
    expect(blocked.decision_reason).toBe('Required verification checks have not passed.');
    expect(proposalStates(mock)).toEqual(['verifying', 'needs_repair']);
    // Model review still ran (the worker never short-circuits on verification).
    expect(aiQueue.length).toBe(0);
  });

  it('inserts setup-failure findings tagged reviewer_kind deterministic_check', async () => {
    const setupFinding = {
      reviewer_kind: 'deterministic_check',
      severity: 'blocker',
      category: 'verification',
      evidence: 'verification setup failed at no_base_sha: no pinned base SHA available',
      state: 'open',
    };
    runAndRecordVerificationMock.mockResolvedValue({ setupFindings: [setupFinding], allRequiredPassed: false });
    const mock = genericSetup({
      finalProposalState: 'needs_repair',
      verificationRuns: [],
      findingsInsertResult: true, // Step 5.5 inserts the setup finding
      // Step 7 re-load surfaces the same open blocker so the real gate blocks.
      findingsReload: [
        { id: 'sf1', review_attempt_id: ATTEMPT_ID, severity: 'blocker', state: 'open', evidence: setupFinding.evidence, reviewer_kind: 'deterministic_check' },
      ],
    });

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const findingsInsert = mock.calls.find(c => c.table === 'builder_review_findings' && c.method === 'insert');
    expect(findingsInsert).toBeDefined();
    const rows = findingsInsert!.args[0] as any[];
    expect(rows[0].reviewer_kind).toBe('deterministic_check');
    expect(rows[0].severity).toBe('blocker');
    expect(rows[0].category).toBe('verification');
    expect(rows[0].review_attempt_id).toBe(ATTEMPT_ID); // stamped by the worker
    expect(proposalStates(mock)).toEqual(['verifying', 'needs_repair']);
  });
});

// ── Generic path ─────────────────────────────────────────────────────────────

describe('runBuildPhase — generic path', () => {
  function setup() {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: null }), error: null }); // load
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null }); // queued→verifying
    mock.queueTable('builder_proposals', { data: { code_state: 'ready_to_apply' }, error: null }); // verifying→ready
    // generic revision already carries frozen hashes from submission
    mock.queueTable('builder_proposal_revisions', {
      data: baseRevision({ manifest_hash: 'm', diff_hash: 'd', context_hash: 'c', file_count: 1, total_bytes: 10 }),
      error: null,
    });
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // final update
    mock.queueTable('builder_review_findings', { data: [], error: null });
    mock.queueTable('builder_verification_runs', { data: passedRuns(DEFAULT_REQUIRED), error: null });
    // files.json download, then 2 review uploads (prompt, response)
    mock.queueStorageDownload('builder-artifacts', {
      data: JSON.stringify({ files: [{ path: 'lib/foo/bar.ts', content: 'export const x = 1;', diff: '' }] }),
      error: null,
    });
    for (let i = 0; i < 2; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = [REVIEW_PASS];
    currentAdmin = mock.client();
    return mock;
  }

  it('skips generating: goes queued→verifying→ready_to_apply', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    expect(proposalStates(mock)).toEqual(['verifying', 'ready_to_apply']);
  });

  it('loads the file set from files.json instead of generating', async () => {
    const mock = setup();
    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });
    const download = mock.calls.find(c => c.method === 'storage.download');
    expect(download).toBeDefined();
    expect(String(download!.args[1])).toMatch(/files\.json$/);
    // No scaffold artifact writes (files/manifest/diff/context) and no hash re-stamp.
    expect(mock.calls.some(c => c.table === 'builder_proposal_revisions' && c.method === 'update')).toBe(false);
  });
});

// ── Path-policy violation ────────────────────────────────────────────────────

describe('runBuildPhase — path policy violation', () => {
  it('records blocker findings, blocks the attempt, and moves to needs_repair', async () => {
    const mock = new SupabaseMock();
    const plan = { ...SCAFFOLD_PLAN, files: [{ path: 'scripts/evil.ts', description: 'bad' }] };
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: plan }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'generating' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'needs_repair' }, error: null });
    mock.queueTable('builder_proposal_revisions', { data: baseRevision(), error: null });
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // progress
    mock.queueTable('builder_proposal_revisions', { data: null, error: null }); // hash stamp
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // blocked update
    mock.queueTable('builder_review_findings', { data: null, error: null }); // findings insert
    for (let i = 0; i < 4; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = ['export const evil = 1;']; // no review call — blocked before review
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const findingsInsert = mock.calls.find(c => c.table === 'builder_review_findings' && c.method === 'insert');
    expect(findingsInsert).toBeDefined();
    const rows = findingsInsert!.args[0] as any[];
    expect(rows[0].severity).toBe('blocker');
    expect(rows[0].reviewer_kind).toBe('system');
    expect(rows[0].file_path).toBe('scripts/evil.ts');

    const blocked = mock.calls
      .filter(c => c.table === 'builder_review_attempts' && c.method === 'update')
      .map(c => c.args[0] as any)
      .find(v => v.status);
    expect(blocked.status).toBe('blocked');
    expect(proposalStates(mock)).toEqual(['generating', 'verifying', 'needs_repair']);
    // never reached the review model
    expect(aiQueue.length).toBe(0);
  });
});

// ── Malformed model JSON ─────────────────────────────────────────────────────

describe('runBuildPhase — malformed model output', () => {
  it('fails the attempt (not blocked), moves proposal to failed, inserts zero findings', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: null }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null }); // queued→verifying
    mock.queueTable('builder_proposals', { data: { code_state: 'failed' }, error: null }); // verifying→failed
    mock.queueTable('builder_proposal_revisions', {
      data: baseRevision({ manifest_hash: 'm', diff_hash: 'd' }),
      error: null,
    });
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // failed update
    mock.queueStorageDownload('builder-artifacts', {
      data: JSON.stringify({ files: [{ path: 'lib/foo/bar.ts', content: 'x', diff: '' }] }),
      error: null,
    });
    for (let i = 0; i < 2; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = ['this is not valid json at all {{{'];
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const failed = mock.calls
      .filter(c => c.table === 'builder_review_attempts' && c.method === 'update')
      .map(c => c.args[0] as any)
      .find(v => v.status);
    expect(failed.status).toBe('failed');
    expect(failed.decision_reason).toMatch(/invalid/i);
    expect(proposalStates(mock)).toEqual(['verifying', 'failed']);
    expect(mock.calls.some(c => c.table === 'builder_review_findings' && c.method === 'insert')).toBe(false);
  });
});

// ── Model findings with blocking severity ────────────────────────────────────

describe('runBuildPhase — blocking model findings', () => {
  it('persists automated_review findings and moves to needs_repair via the gate', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: null }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'needs_repair' }, error: null });
    mock.queueTable('builder_proposal_revisions', {
      data: baseRevision({ manifest_hash: 'm', diff_hash: 'd' }),
      error: null,
    });
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // blocked update
    mock.queueTable('builder_review_findings', { data: null, error: null }); // insert findings
    // gate re-load: return the blocking finding as an open row
    mock.queueTable('builder_review_findings', {
      data: [{ id: 'f1', review_attempt_id: ATTEMPT_ID, severity: 'error', state: 'open', evidence: 'Missing auth guard' }],
      error: null,
    });
    mock.queueTable('builder_verification_runs', { data: [], error: null });
    mock.queueStorageDownload('builder-artifacts', {
      data: JSON.stringify({ files: [{ path: 'lib/foo/bar.ts', content: 'x', diff: '' }] }),
      error: null,
    });
    for (let i = 0; i < 2; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = [
      JSON.stringify({
        summary_score: 40,
        findings: [
          { severity: 'error', evidence: 'Missing auth guard', category: 'security', file_path: 'lib/foo/bar.ts', line_start: 1, line_end: 2, recommendation: 'Add guard' },
        ],
      }),
    ];
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const findingsInsert = mock.calls.find(c => c.table === 'builder_review_findings' && c.method === 'insert');
    expect(findingsInsert).toBeDefined();
    const rows = findingsInsert!.args[0] as any[];
    expect(rows[0].reviewer_kind).toBe('automated_review');
    expect(rows[0].severity).toBe('error');
    expect(rows[0].state).toBe('open');

    const blocked = mock.calls
      .filter(c => c.table === 'builder_review_attempts' && c.method === 'update')
      .map(c => c.args[0] as any)
      .find(v => v.status);
    expect(blocked.status).toBe('blocked');
    expect(blocked.decision_reason).toMatch(/blocking findings/i);
    expect(proposalStates(mock)).toEqual(['verifying', 'needs_repair']);
  });
});

// ── Re-entry guard ───────────────────────────────────────────────────────────

describe('runBuildPhase — re-entry guard', () => {
  it('exits without any writes when code_state is not queued', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ code_state: 'verifying' }), error: null });
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const writes = mock.calls.filter(c => ['update', 'insert', 'delete'].includes(c.method));
    expect(writes).toEqual([]);
    expect(mock.calls.some(c => c.method === 'storage.upload')).toBe(false);
  });

  it('exits without writes when the current revision no longer matches', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', {
      data: baseProposal({ current_revision_id: 'different-revision' }),
      error: null,
    });
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const writes = mock.calls.filter(c => ['update', 'insert', 'delete'].includes(c.method));
    expect(writes).toEqual([]);
  });
});

// ── markProposalRunFailed ────────────────────────────────────────────────────

describe('markProposalRunFailed', () => {
  it('completes the latest running attempt and CASes the in-flight run to failed', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // latest running
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // status update
    mock.queueTable('builder_review_findings', { data: null, error: null }); // finding insert
    mock.queueTable('builder_proposals', { data: null, error: null }); // failInFlightRun
    currentAdmin = mock.client();

    await markProposalRunFailed(PROPOSAL_ID, ORG_ID, 'boom');

    const attemptUpdate = mock.calls.find(c => c.table === 'builder_review_attempts' && c.method === 'update');
    expect((attemptUpdate!.args[0] as any).status).toBe('failed');

    const finding = mock.calls.find(c => c.table === 'builder_review_findings' && c.method === 'insert');
    expect((finding!.args[0] as any).severity).toBe('error');
    expect((finding!.args[0] as any).reviewer_kind).toBe('system');

    // failInFlightRun: CAS the proposal in an in-flight state to failed.
    const inflight = mock.calls.find(
      c => c.table === 'builder_proposals' && c.method === 'update' && (c.args[0] as any).code_state === 'failed'
    );
    expect(inflight).toBeDefined();
    expect(mock.calls.some(c => c.table === 'builder_proposals' && c.method === 'in')).toBe(true);
  });

  it('still fails the in-flight run when there is no running attempt', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // no running attempt
    mock.queueTable('builder_proposals', { data: null, error: null }); // failInFlightRun
    currentAdmin = mock.client();

    await markProposalRunFailed(PROPOSAL_ID, ORG_ID, 'boom');

    expect(mock.calls.some(c => c.table === 'builder_review_attempts' && c.method === 'update')).toBe(false);
    expect(mock.calls.some(c => c.table === 'builder_review_findings')).toBe(false);
    expect(
      mock.calls.some(c => c.table === 'builder_proposals' && c.method === 'update' && (c.args[0] as any).code_state === 'failed')
    ).toBe(true);
  });
});

// ── Retry attempt numbering ──────────────────────────────────────────────────

describe('runBuildPhase — second attempt on same revision', () => {
  it('numbers the attempt 2 with trigger retry', async () => {
    const mock = new SupabaseMock();
    mock.queueTable('builder_proposals', { data: baseProposal({ plan_content: null }), error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'verifying' }, error: null });
    mock.queueTable('builder_proposals', { data: { code_state: 'ready_to_apply' }, error: null });
    mock.queueTable('builder_proposal_revisions', {
      data: baseRevision({ manifest_hash: 'm', diff_hash: 'd' }),
      error: null,
    });
    // an existing attempt #1 is already on this revision
    mock.queueTable('builder_review_attempts', { data: { attempt_number: 1 }, error: null }); // count
    mock.queueTable('builder_review_attempts', { data: { id: ATTEMPT_ID }, error: null }); // insert
    mock.queueTable('builder_review_attempts', { data: null, error: null }); // final update
    mock.queueTable('builder_review_findings', { data: [], error: null });
    mock.queueTable('builder_verification_runs', { data: passedRuns(DEFAULT_REQUIRED), error: null });
    mock.queueStorageDownload('builder-artifacts', {
      data: JSON.stringify({ files: [{ path: 'lib/foo/bar.ts', content: 'x', diff: '' }] }),
      error: null,
    });
    for (let i = 0; i < 2; i++) mock.queueStorageUpload('builder-artifacts', { data: { path: 'x' }, error: null });

    aiQueue = [REVIEW_PASS];
    currentAdmin = mock.client();

    await runBuildPhase({ proposalId: PROPOSAL_ID, orgId: ORG_ID, revisionId: REVISION_ID });

    const insert = mock.calls.find(c => c.table === 'builder_review_attempts' && c.method === 'insert');
    const payload = insert!.args[0] as Record<string, unknown>;
    expect(payload.attempt_number).toBe(2);
    expect(payload.trigger).toBe('retry');
  });
});
