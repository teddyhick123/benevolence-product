// lib/builder/__tests__/verification.test.ts
//
// Task 5 — persistence glue: runAndRecordVerification runs a VerificationRunner,
// uploads each check's capped/redacted log as an artifact, and idempotently
// upserts builder_verification_runs rows (UNIQUE(review_attempt_id, check_key)).
//
// This is a pure orchestration test: the runner is a scripted stub (never real
// git/subprocess execution — that's covered by verification-runner's own
// suites), and Supabase is the shared SupabaseMock. Coverage: exact upsert
// payloads + onConflict, exact artifact keys/prefixes, evidence_hash computed
// from the CAPPED log (not raw), log-upload-failure degradation, setupFailure
// -> one blocker finding, authoritative-diff upload (+ non-fatal failure),
// genuine redaction, and re-run idempotency (upsert, never insert).

import { describe, it, expect, vi } from 'vitest';
import { runAndRecordVerification } from '@/lib/builder/verification';
import type { CheckKey } from '@/lib/builder/check-matrix';
import type {
  CheckExecution,
  VerificationOutcome,
  VerificationRunner,
  VerificationInput,
} from '@/lib/builder/verification-runner';
import { sha256Hex, capAndRedactLog, artifactPrefix, ARTIFACT_KEYS } from '@/lib/builder/artifacts';
import { SupabaseMock } from './helpers/supabase-mock';

const BUCKET = 'builder-artifacts';
const RUNS_TABLE = 'builder_verification_runs';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-4444-444444444444';

const PREFIX = artifactPrefix(ORG_ID, PROPOSAL_ID, REVISION_ID);
const REQUIRED: CheckKey[] = ['verify:types', 'verify:lint'];

function baseArgs(runner: VerificationRunner, overrides: Partial<{
  requiredKeys: CheckKey[];
  baseSha: string | null;
  files: Array<{ path: string; content: string }>;
}> = {}) {
  return {
    orgId: ORG_ID,
    proposalId: PROPOSAL_ID,
    revisionId: REVISION_ID,
    attemptId: ATTEMPT_ID,
    files: overrides.files ?? [],
    baseSha: overrides.baseSha ?? 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    requiredKeys: overrides.requiredKeys ?? REQUIRED,
    runner,
  };
}

function exec(key: CheckKey, status: CheckExecution['status'], overrides: Partial<CheckExecution> = {}): CheckExecution {
  return {
    key,
    status,
    exitCode: overrides.exitCode ?? (status === 'passed' ? 0 : status === 'skipped' || status === 'error' ? null : 1),
    durationMs: overrides.durationMs ?? 1234,
    commandVersion: overrides.commandVersion ?? 'v1.0.0',
    log: overrides.log ?? `${key} log output`,
    startedAt: overrides.startedAt ?? '2026-07-24T00:00:00.000Z',
    completedAt: overrides.completedAt ?? '2026-07-24T00:00:01.000Z',
  };
}

/** Scripted stub — never touches real git/subprocess execution. */
class StubRunner implements VerificationRunner {
  public inputs: VerificationInput[] = [];
  constructor(private readonly outcome: VerificationOutcome) {}
  async run(input: VerificationInput): Promise<VerificationOutcome> {
    this.inputs.push(input);
    return this.outcome;
  }
}

function queueUploadsAndUpserts(mock: SupabaseMock, count: number) {
  for (let i = 0; i < count; i++) {
    mock.queueStorageUpload(BUCKET, { data: { path: 'x' }, error: null });
    mock.queueTable(RUNS_TABLE, { data: null, error: null });
  }
}

// ============================================================
// Happy path
// ============================================================

describe('runAndRecordVerification — happy path', () => {
  it('uploads one capped-log artifact and upserts one row per check, with the exact payload and onConflict', async () => {
    const mock = new SupabaseMock();
    const checks = [
      exec('verify:types', 'passed'),
      exec('verify:lint', 'failed', { exitCode: 1, log: 'lint failed on 2 files' }),
    ];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    queueUploadsAndUpserts(mock, 2);

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));
    expect(result.setupFindings).toEqual([]);

    const uploadCalls = mock.calls.filter((c) => c.method === 'storage.upload');
    expect(uploadCalls).toHaveLength(2);
    expect(uploadCalls[0].args).toEqual([
      BUCKET,
      `${PREFIX}/checks/verify:types.log`,
      'verify:types log output',
      { contentType: 'text/plain', upsert: false },
    ]);
    expect(uploadCalls[1].args).toEqual([
      BUCKET,
      `${PREFIX}/checks/verify:lint.log`,
      'lint failed on 2 files',
      { contentType: 'text/plain', upsert: false },
    ]);

    const upsertCalls = mock.calls.filter((c) => c.table === RUNS_TABLE && c.method === 'upsert');
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0].args).toEqual([
      {
        review_attempt_id: ATTEMPT_ID,
        check_key: 'verify:types',
        status: 'passed',
        exit_code: 0,
        duration_ms: 1234,
        command_version: 'v1.0.0',
        log_artifact_key: `${PREFIX}/checks/verify:types.log`,
        evidence_hash: sha256Hex('verify:types log output'),
        started_at: '2026-07-24T00:00:00.000Z',
        completed_at: '2026-07-24T00:00:01.000Z',
      },
      { onConflict: 'review_attempt_id,check_key' },
    ]);
    expect(upsertCalls[1].args).toEqual([
      {
        review_attempt_id: ATTEMPT_ID,
        check_key: 'verify:lint',
        status: 'failed',
        exit_code: 1,
        duration_ms: 1234,
        command_version: 'v1.0.0',
        log_artifact_key: `${PREFIX}/checks/verify:lint.log`,
        evidence_hash: sha256Hex('lint failed on 2 files'),
        started_at: '2026-07-24T00:00:00.000Z',
        completed_at: '2026-07-24T00:00:01.000Z',
      },
      { onConflict: 'review_attempt_id,check_key' },
    ]);

    // No insert() call — this must always be an upsert.
    expect(mock.calls.some((c) => c.table === RUNS_TABLE && c.method === 'insert')).toBe(false);
  });

  it('allRequiredPassed is true only when every required key is present and passed', async () => {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'passed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    queueUploadsAndUpserts(mock, 2);

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    expect(result.allRequiredPassed).toBe(true);
    expect(result.setupFindings).toEqual([]);
  });

  it('allRequiredPassed is false when a required check did not pass', async () => {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'failed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    queueUploadsAndUpserts(mock, 2);

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    expect(result.allRequiredPassed).toBe(false);
  });

  it('passes baseSha, files, and requiredKeys straight through to runner.run()', async () => {
    const mock = new SupabaseMock();
    const outcome: VerificationOutcome = { checks: [], setupFailure: null, authoritativeDiff: null };
    const runner = new StubRunner(outcome);
    const files = [{ path: 'lib/x.ts', content: 'export const x = 1;' }];

    await runAndRecordVerification(
      mock.client(),
      baseArgs(runner, { requiredKeys: ['verify:build'], baseSha: 'cafebabe', files })
    );

    expect(runner.inputs).toEqual([{ baseSha: 'cafebabe', files, requiredKeys: ['verify:build'] }]);
  });
});

// ============================================================
// Log-upload failure degrades the row, not the status
// ============================================================

describe('runAndRecordVerification — log-upload failure', () => {
  it('downgrades log_artifact_key to null but leaves status/evidence_hash intact, and does not throw', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'passed', { log: 'all good' })];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };

    mock.queueStorageUpload(BUCKET, { data: null, error: { message: 'storage unavailable' } });
    mock.queueTable(RUNS_TABLE, { data: null, error: null });

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    const upsertCall = mock.calls.find((c) => c.table === RUNS_TABLE && c.method === 'upsert')!;
    const [row] = upsertCall.args as [Record<string, unknown>, unknown];
    expect(row.log_artifact_key).toBeNull();
    expect(row.status).toBe('passed'); // unchanged by the upload failure
    expect(row.evidence_hash).toBe(sha256Hex('all good')); // still computed from the capped log
    expect(result.allRequiredPassed).toBe(false); // verify:lint from REQUIRED never ran
    expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it('the run row is still written even though the log upload failed (evidence must not be lost)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'error', { log: 'boom' })];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };

    mock.queueStorageUpload(BUCKET, { data: null, error: { message: 'storage unavailable' } });
    mock.queueTable(RUNS_TABLE, { data: null, error: null });

    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome), { requiredKeys: ['verify:types'] }));

    const upsertCalls = mock.calls.filter((c) => c.table === RUNS_TABLE && c.method === 'upsert');
    expect(upsertCalls).toHaveLength(1);
    expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});

// ============================================================
// setupFailure -> exactly one blocker finding
// ============================================================

describe('runAndRecordVerification — setupFailure', () => {
  it('still writes a row per (skipped/errored) check AND returns one deterministic_check blocker finding', async () => {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'skipped', { exitCode: null, commandVersion: null, log: 'disallowed path: .env' }), exec('verify:lint', 'skipped', { exitCode: null, commandVersion: null, log: 'disallowed path: .env' })];
    const outcome: VerificationOutcome = {
      checks,
      setupFailure: { stage: 'path_policy', detail: 'disallowed path: .env' },
      authoritativeDiff: null,
    };
    queueUploadsAndUpserts(mock, 2);

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    const upsertCalls = mock.calls.filter((c) => c.table === RUNS_TABLE && c.method === 'upsert');
    expect(upsertCalls).toHaveLength(2);
    expect((upsertCalls[0].args[0] as Record<string, unknown>).status).toBe('skipped');
    expect((upsertCalls[1].args[0] as Record<string, unknown>).status).toBe('skipped');

    expect(result.setupFindings).toEqual([
      {
        reviewer_kind: 'deterministic_check',
        severity: 'blocker',
        category: 'verification',
        evidence: capAndRedactLog('verification setup failed at path_policy: disallowed path: .env', 10_000),
        state: 'open',
      },
    ]);
    expect(result.allRequiredPassed).toBe(false);
  });

  it('produces exactly one finding regardless of how many checks were skipped/errored', async () => {
    const mock = new SupabaseMock();
    const checks = [
      exec('verify:types', 'error', { exitCode: null, commandVersion: null, log: 'no pinned base SHA available' }),
      exec('verify:lint', 'error', { exitCode: null, commandVersion: null, log: 'no pinned base SHA available' }),
    ];
    const outcome: VerificationOutcome = {
      checks,
      setupFailure: { stage: 'no_base_sha', detail: 'no pinned base SHA available' },
      authoritativeDiff: null,
    };
    queueUploadsAndUpserts(mock, 2);

    const result = await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome), { baseSha: null }));

    expect(result.setupFindings).toHaveLength(1);
    expect(result.setupFindings[0].reviewer_kind).toBe('deterministic_check');
    expect(result.setupFindings[0].evidence).toContain('no_base_sha');
  });
});

// ============================================================
// Authoritative diff
// ============================================================

describe('runAndRecordVerification — authoritative diff', () => {
  it('uploads the diff artifact, raw (uncapped), under the right prefix when present', async () => {
    const mock = new SupabaseMock();
    const diff = '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new';
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'passed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: diff };
    queueUploadsAndUpserts(mock, 2);
    mock.queueStorageUpload(BUCKET, { data: { path: 'diff' }, error: null }); // the diff upload itself

    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    const diffUploadCall = mock.calls.find(
      (c) => c.method === 'storage.upload' && c.args[1] === `${PREFIX}/${ARTIFACT_KEYS.authoritativeDiff}`
    );
    expect(diffUploadCall).toBeDefined();
    expect(diffUploadCall!.args[2]).toBe(diff);
  });

  it('does not upload anything when authoritativeDiff is null', async () => {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'passed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    queueUploadsAndUpserts(mock, 2);

    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    const diffUploadCall = mock.calls.find(
      (c) => c.method === 'storage.upload' && c.args[1] === `${PREFIX}/${ARTIFACT_KEYS.authoritativeDiff}`
    );
    expect(diffUploadCall).toBeUndefined();
  });

  it('a diff-upload failure is non-fatal: swallowed, does not propagate, does not affect the returned result', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
    const mock = new SupabaseMock();
    const diff = 'diff body';
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'passed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: diff };
    queueUploadsAndUpserts(mock, 2);
    mock.queueStorageUpload(BUCKET, { data: null, error: { message: 'disk full' } }); // the diff upload itself

    await expect(runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)))).resolves.toMatchObject({
      allRequiredPassed: true,
      setupFindings: [],
    });
    expect(consoleWarnSpy).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});

// ============================================================
// Redaction
// ============================================================

describe('runAndRecordVerification — redaction', () => {
  it('a Bearer-token-shaped secret in the log is redacted in the uploaded body and the hashed evidence, never the raw secret', async () => {
    const mock = new SupabaseMock();
    const rawLog = 'Request failed: Authorization: Bearer abc123 was rejected by upstream';
    const checks = [exec('verify:types', 'failed', { log: rawLog })];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    mock.queueStorageUpload(BUCKET, { data: { path: 'x' }, error: null });
    mock.queueTable(RUNS_TABLE, { data: null, error: null });

    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome), { requiredKeys: ['verify:types'] }));

    const uploadCall = mock.calls.find((c) => c.method === 'storage.upload')!;
    const uploadedBody = uploadCall.args[2] as string;
    expect(uploadedBody).not.toContain('abc123');
    expect(uploadedBody).toContain('[redacted]');
    expect(uploadedBody).toBe('Request failed: Authorization: [redacted] was rejected by upstream');

    const upsertCall = mock.calls.find((c) => c.table === RUNS_TABLE && c.method === 'upsert')!;
    const [row] = upsertCall.args as [Record<string, unknown>, unknown];
    // evidence_hash must be the hash of the CAPPED+REDACTED log, not the raw log.
    expect(row.evidence_hash).toBe(sha256Hex(uploadedBody));
    expect(row.evidence_hash).not.toBe(sha256Hex(rawLog));
  });
});

// ============================================================
// Idempotency
// ============================================================

describe('runAndRecordVerification — idempotency', () => {
  it('re-running the same attempt upserts again (never a plain insert)', async () => {
    const mock = new SupabaseMock();
    const checks = [exec('verify:types', 'passed'), exec('verify:lint', 'passed')];
    const outcome: VerificationOutcome = { checks, setupFailure: null, authoritativeDiff: null };
    queueUploadsAndUpserts(mock, 4); // two runs x two checks

    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));
    await runAndRecordVerification(mock.client(), baseArgs(new StubRunner(outcome)));

    const upsertCalls = mock.calls.filter((c) => c.table === RUNS_TABLE && c.method === 'upsert');
    expect(upsertCalls).toHaveLength(4);
    for (const call of upsertCalls) {
      expect(call.args[1]).toEqual({ onConflict: 'review_attempt_id,check_key' });
    }
    expect(mock.calls.some((c) => c.table === RUNS_TABLE && c.method === 'insert')).toBe(false);
  });
});
