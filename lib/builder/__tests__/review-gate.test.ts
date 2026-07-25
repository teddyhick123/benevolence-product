// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BLOCKING_SEVERITIES,
  evaluateAttemptGate,
  parseModelReviewOutput,
  type AttemptGateInput,
} from '@/lib/builder/review-gate';
import type { RevisionRow, ReviewAttemptRow, FindingRow, VerificationRunRow } from '@/lib/builder/proposal-state';

// ============================================================
// Fixtures — a fully healthy, passing input. Each test mutates one field.
// ============================================================

const POLICY_VERSION = 'builder-review-policy/v1';

function makeRevision(overrides: Partial<RevisionRow> = {}): RevisionRow {
  return {
    id: 'rev-1',
    proposal_id: 'prop-1',
    revision_number: 1,
    parent_revision_id: null,
    kind: 'scaffold_generation',
    base_commit_sha: null,
    head_commit_sha: null,
    manifest_hash: 'manifest-hash',
    diff_hash: 'diff-hash',
    context_hash: null,
    artifact_prefix: 'org-1/prop-1/rev-1',
    file_count: 1,
    total_bytes: 100,
    progress: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<ReviewAttemptRow> = {}): ReviewAttemptRow {
  return {
    id: 'att-1',
    proposal_id: 'prop-1',
    revision_id: 'rev-1',
    attempt_number: 1,
    trigger: 'initial',
    status: 'passed',
    policy_version: POLICY_VERSION,
    required_check_keys: [],
    summary_score: 90,
    started_at: '2026-01-01T00:00:00Z',
    completed_at: '2026-01-01T00:05:00Z',
    decision_reason: null,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: 'find-1',
    review_attempt_id: 'att-1',
    reviewer_kind: 'automated_review',
    severity: 'blocker',
    category: null,
    rule_id: null,
    file_path: null,
    line_start: null,
    line_end: null,
    evidence: 'Missing RLS policy on new table.',
    recommendation: null,
    state: 'open',
    ...overrides,
  };
}

function makeRun(overrides: Partial<VerificationRunRow> = {}): VerificationRunRow {
  return {
    id: 'run-1',
    review_attempt_id: 'att-1',
    check_key: 'verify:types',
    status: 'passed',
    exit_code: 0,
    duration_ms: 100,
    log_artifact_key: null,
    evidence_hash: null,
    command_version: null,
    started_at: null,
    completed_at: null,
    created_at: '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeInput(overrides: Partial<AttemptGateInput> = {}): AttemptGateInput {
  return {
    proposal: { code_state: 'verifying', current_revision_id: 'rev-1' },
    revision: makeRevision(),
    attempt: makeAttempt(),
    findings: [],
    verificationRuns: [],
    currentPolicyVersion: POLICY_VERSION,
    ...overrides,
  };
}

// ============================================================
// evaluateAttemptGate — one test per fail clause, in brief order
// ============================================================

describe('evaluateAttemptGate', () => {
  it('passes a fully healthy attempt with no findings and no required checks', () => {
    const result = evaluateAttemptGate(makeInput());
    expect(result).toEqual({ pass: true, blockers: [], reason: null });
  });

  it('fails closed when the proposal has no current_revision_id', () => {
    const result = evaluateAttemptGate(
      makeInput({ proposal: { code_state: 'plan_ready', current_revision_id: null } })
    );
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual([]);
    expect(result.reason).toMatch(/no current revision/i);
  });

  it('fails closed when no revision row exists', () => {
    const result = evaluateAttemptGate(makeInput({ revision: null }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no revision/i);
  });

  it('fails closed when the revision manifest_hash is null', () => {
    const result = evaluateAttemptGate(makeInput({ revision: makeRevision({ manifest_hash: null }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/manifest|hash/i);
  });

  it('fails closed when the revision diff_hash is null', () => {
    const result = evaluateAttemptGate(makeInput({ revision: makeRevision({ diff_hash: null }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/diff|hash/i);
  });

  it('fails closed when there is no review attempt', () => {
    const result = evaluateAttemptGate(makeInput({ attempt: null }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no review attempt/i);
  });

  it('fails closed when the attempt belongs to a stale (non-current) revision', () => {
    const result = evaluateAttemptGate(makeInput({ attempt: makeAttempt({ revision_id: 'rev-0-stale' }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/does not belong to the current revision/i);
  });

  it('fails closed when the attempt status is not "passed"', () => {
    const result = evaluateAttemptGate(makeInput({ attempt: makeAttempt({ status: 'blocked' }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not completed successfully/i);
  });

  it('fails closed when the attempt has no completed_at, even if status says passed', () => {
    // Defends against a data-entry bug where status is stamped 'passed' before completion is recorded.
    const result = evaluateAttemptGate(makeInput({ attempt: makeAttempt({ completed_at: null }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/not completed successfully/i);
  });

  it('fails closed when the attempt used a stale policy_version', () => {
    const result = evaluateAttemptGate(makeInput({ attempt: makeAttempt({ policy_version: 'builder-review-policy/v0' }) }));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/policy/i);
  });

  it('fails and collects blockers for open findings at blocking severity', () => {
    const result = evaluateAttemptGate(
      makeInput({
        findings: [
          makeFinding({ severity: 'blocker', state: 'open', evidence: 'Missing RLS policy.' }),
          makeFinding({ id: 'find-2', severity: 'error', state: 'open', evidence: 'SQL injection risk.' }),
          makeFinding({ id: 'find-3', severity: 'warning', state: 'open', evidence: 'Nit: naming.' }),
        ],
      })
    );
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(['Missing RLS policy.', 'SQL injection risk.']);
    expect(result.reason).toMatch(/blocking finding/i);
  });

  it('passes when the only blocker finding is resolved, not open', () => {
    const result = evaluateAttemptGate(
      makeInput({
        findings: [makeFinding({ severity: 'blocker', state: 'resolved', evidence: 'Was missing RLS, now fixed.' })],
      })
    );
    expect(result).toEqual({ pass: true, blockers: [], reason: null });
  });

  it('does not treat warning/info severities as blocking even when open', () => {
    const result = evaluateAttemptGate(
      makeInput({
        findings: [
          makeFinding({ severity: 'warning', state: 'open' }),
          makeFinding({ id: 'find-2', severity: 'info', state: 'open' }),
        ],
      })
    );
    expect(result.pass).toBe(true);
  });

  it('fails when a required_check_keys entry has no verification run at all (Increment 3 hook)', () => {
    const result = evaluateAttemptGate(
      makeInput({
        attempt: makeAttempt({ required_check_keys: ['verify:types'] }),
        verificationRuns: [],
      })
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/required verification/i);
  });

  it('passes once the required check has a passed verification run (Increment 3 hook)', () => {
    const result = evaluateAttemptGate(
      makeInput({
        attempt: makeAttempt({ required_check_keys: ['verify:types'] }),
        verificationRuns: [makeRun({ check_key: 'verify:types', status: 'passed' })],
      })
    );
    expect(result).toEqual({ pass: true, blockers: [], reason: null });
  });

  it('fails when a required check has a run that has not passed (e.g. failed or still running)', () => {
    const result = evaluateAttemptGate(
      makeInput({
        attempt: makeAttempt({ required_check_keys: ['verify:types'] }),
        verificationRuns: [makeRun({ check_key: 'verify:types', status: 'failed' })],
      })
    );
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/required verification/i);
  });

  it('BLOCKING_SEVERITIES is exactly blocker and error', () => {
    expect(BLOCKING_SEVERITIES).toEqual(new Set(['blocker', 'error']));
  });
});

// ============================================================
// parseModelReviewOutput — strict LLM-output validator
// ============================================================

describe('parseModelReviewOutput', () => {
  it('accepts a well-formed report', () => {
    const parsed = parseModelReviewOutput({
      summary_score: 82,
      findings: [
        {
          severity: 'error',
          category: 'security',
          file_path: 'app/api/foo/route.ts',
          line_start: 10,
          line_end: 12,
          evidence: 'Missing RLS policy on new table.',
          recommendation: 'Add is_org_admin write policy.',
        },
      ],
    });
    expect(parsed).toEqual({
      summaryScore: 82,
      findings: [
        {
          severity: 'error',
          category: 'security',
          file_path: 'app/api/foo/route.ts',
          line_start: 10,
          line_end: 12,
          evidence: 'Missing RLS policy on new table.',
          recommendation: 'Add is_org_admin write policy.',
        },
      ],
    });
  });

  it('accepts null-optional fields and a null summary_score', () => {
    const parsed = parseModelReviewOutput({
      summary_score: null,
      findings: [{ severity: 'warning', evidence: 'Nit: naming.' }],
    });
    expect(parsed).toEqual({
      summaryScore: null,
      findings: [
        {
          severity: 'warning',
          category: null,
          file_path: null,
          line_start: null,
          line_end: null,
          evidence: 'Nit: naming.',
          recommendation: null,
        },
      ],
    });
  });

  it('normalizes "critical" severity to "blocker"', () => {
    const parsed = parseModelReviewOutput({
      summary_score: 10,
      findings: [{ severity: 'critical', evidence: 'Auth bypass.' }],
    });
    expect(parsed?.findings[0].severity).toBe('blocker');
  });

  it('normalizes severity case-insensitively', () => {
    const parsed = parseModelReviewOutput({
      summary_score: 10,
      findings: [{ severity: 'BLOCKER', evidence: 'x' }],
    });
    expect(parsed?.findings[0].severity).toBe('blocker');
  });

  it('rejects an unknown severity as an infrastructure failure (null, not empty pass)', () => {
    const parsed = parseModelReviewOutput({
      summary_score: 90,
      findings: [{ severity: 'super-duper-bad', evidence: 'x' }],
    });
    expect(parsed).toBeNull();
  });

  it('rejects a non-array findings field', () => {
    expect(parseModelReviewOutput({ summary_score: 90, findings: 'none' })).toBeNull();
    expect(parseModelReviewOutput({ summary_score: 90, findings: {} })).toBeNull();
    expect(parseModelReviewOutput({ summary_score: 90 })).toBeNull();
  });

  it('rejects a finding missing evidence', () => {
    const parsed = parseModelReviewOutput({
      summary_score: 90,
      findings: [{ severity: 'warning' }],
    });
    expect(parsed).toBeNull();
  });

  it('rejects null, non-object, and array top-level values', () => {
    expect(parseModelReviewOutput(null)).toBeNull();
    expect(parseModelReviewOutput(undefined)).toBeNull();
    expect(parseModelReviewOutput('not an object')).toBeNull();
    expect(parseModelReviewOutput([])).toBeNull();
  });

  it('never returns an empty-findings pass for a malformed shape', () => {
    // A single bad finding invalidates the whole report — it must not silently
    // drop the bad entry and return the good ones as a "clean" empty-ish pass.
    const parsed = parseModelReviewOutput({
      summary_score: 90,
      findings: [
        { severity: 'warning', evidence: 'ok' },
        { severity: 'not-a-real-severity', evidence: 'bad' },
      ],
    });
    expect(parsed).toBeNull();
  });
});
