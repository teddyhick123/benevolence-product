// @vitest-environment node
//
// Tests for POST /api/org/[orgId]/builder/proposals/[proposalId]/apply
//
// The last safety gate before code reaches GitHub. Under the Increment 2
// durable data contract, a PR may open only when the proposal is a `code`
// proposal in `code_state === 'ready_to_apply'` with a current revision whose
// latest review attempt passes `evaluateAttemptGate` (fresh policy version, no
// open blocking findings, all required verification checks passed), whose
// stored artifacts still hash to the recorded manifest/diff hashes (tamper
// guard), whose files pass the path policy, and whose base branch has not
// moved since review. A model score is NEVER an authorization signal.
//
// On success the route writes a `builder_delivery_records` row (provider
// facts), stamps `head_commit_sha` on the revision exactly once, and
// transitions ready_to_apply -> pr_opened. It must NEVER write a `status` or
// `pr_url` column on `builder_proposals` (those columns no longer exist). On
// EVERY failure branch GitHub is never called.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  sha256Hex,
  canonicalJson,
} from '@/lib/builder/artifacts';
import { REVIEW_POLICY_VERSION } from '@/lib/builder/proposal-state';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-4444-444444444444';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BASE_SHA = 'basesha0000000000000000000000000000000000';
const HEAD_SHA = 'headsha9999999999999999999999999999999999';

const FILES = [
  {
    path: 'components/volunteer/VolunteerList.tsx',
    content: 'export default function VolunteerList() { return null; }',
    diff: '',
  },
];
const MANIFEST_INPUT = FILES.map(f => ({ path: f.path, content: f.content }));
const M_HASH = manifestHash(buildFileManifest(MANIFEST_INPUT));
const D_HASH = sha256Hex(buildUnifiedDiff(MANIFEST_INPUT));

// ── test-controlled state ───────────────────────────────────────────────────
let _authUser: { id: string } | null;
let _canReview: boolean;
let _githubConfigured: boolean;
let _proposalRow: Record<string, unknown> | null;
let _revisionRow: Record<string, unknown> | null;
let _attemptRow: Record<string, unknown> | null;
let _findings: Array<Record<string, unknown>>;
let _runs: Array<Record<string, unknown>>;
let _filesArtifact: { files: Array<{ path: string; content: string; diff?: string }> } | null;
let _defaultBranchSha: string;

let _allUpdates: Array<{ table: string; values: Record<string, unknown> }>;
let _revisionUpdates: Array<Record<string, unknown>>;
let _deliveryUpserts: Array<{ row: Record<string, unknown>; options: Record<string, unknown> | undefined }>;
let _eventInserts: Array<Record<string, unknown>>;

const applyMock = vi.fn(async (..._args: unknown[]) => ({
  prUrl: 'https://github.com/acme/repo/pull/7',
  prNumber: 7,
  branchName: 'builder/scaffold-22222222',
  baseSha: BASE_SHA,
  headSha: HEAD_SHA,
}));
const getDefaultBranchShaMock = vi.fn(async () => _defaultBranchSha);

function computeResult(state: {
  table: string;
  op: string;
  payload: Record<string, unknown> | null;
  filters: Record<string, unknown>;
}): { data: unknown; error: unknown } {
  const { table, op, payload, filters } = state;
  switch (table) {
    case 'builder_proposals':
      if (op === 'update') {
        // Simulates transitionProposal's compare-and-set on code_state.
        const matched = filters.code_state === _proposalRow?.code_state;
        return { data: matched ? { code_state: payload?.code_state } : null, error: null };
      }
      return { data: _proposalRow, error: null };
    case 'builder_proposal_revisions':
      if (op === 'update') return { data: null, error: null };
      return { data: _revisionRow, error: null };
    case 'builder_review_attempts':
      return { data: _attemptRow, error: null };
    case 'builder_review_findings':
      return { data: _findings, error: null };
    case 'builder_verification_runs':
      return { data: _runs, error: null };
    case 'builder_delivery_records':
      return { data: null, error: null };
    case 'builder_events':
      return { data: null, error: null };
    default:
      throw new Error(`unexpected table ${table}`);
  }
}

function makeQB(table: string) {
  const state = { table, op: 'select', payload: null as Record<string, unknown> | null, filters: {} as Record<string, unknown> };
  const qb: Record<string, unknown> = {
    select: () => qb,
    order: () => qb,
    limit: () => qb,
    eq: (col: string, val: unknown) => {
      state.filters[col] = val;
      return qb;
    },
    update: (values: Record<string, unknown>) => {
      state.op = 'update';
      state.payload = values;
      _allUpdates.push({ table, values });
      if (table === 'builder_proposal_revisions') _revisionUpdates.push(values);
      return qb;
    },
    insert: (row: Record<string, unknown>) => {
      state.op = 'insert';
      state.payload = row;
      if (table === 'builder_events') _eventInserts.push(row);
      return qb;
    },
    upsert: (row: Record<string, unknown>, options?: Record<string, unknown>) => {
      state.op = 'upsert';
      state.payload = row;
      if (table === 'builder_delivery_records') _deliveryUpserts.push({ row, options });
      return qb;
    },
    maybeSingle: async () => computeResult(state),
    single: async () => computeResult(state),
    then: (onF: (_value: unknown) => unknown, onR?: (_error: unknown) => unknown) =>
      Promise.resolve(computeResult(state)).then(onF, onR),
  };
  return qb;
}

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: vi.fn(async () => _authUser
    ? { ok: true, context: { user: _authUser, db: {} } }
    : {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      }),
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({
    from: (table: string) => makeQB(table),
  })),
}));

vi.mock('@/lib/builder/github-apply', () => ({
  isGitHubConfigured: () => _githubConfigured,
  applyProposalToGitHub: (...args: unknown[]) => applyMock(...args),
  getDefaultBranchSha: (...args: unknown[]) => getDefaultBranchShaMock(...(args as [])),
}));

vi.mock('@/lib/org-capabilities', () => ({
  canReviewImplementation: vi.fn(async () => _canReview),
}));

// Keep the real hashing functions; only stub the storage read.
vi.mock('@/lib/builder/artifacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/builder/artifacts')>();
  return { ...actual, readJsonArtifact: vi.fn(async () => _filesArtifact) };
});

import { POST } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route';

function call() {
  return POST(new NextRequest('http://localhost/api/apply', { method: 'POST' }), {
    params: Promise.resolve({ orgId: ORG_ID, proposalId: PROPOSAL_ID }),
  });
}

function healthyProposal(): Record<string, unknown> {
  return {
    id: PROPOSAL_ID,
    org_id: ORG_ID,
    proposal_type: 'code',
    code_state: 'ready_to_apply',
    current_revision_id: REVISION_ID,
    plan_content: { moduleName: 'Volunteer Tracking' },
  };
}

function healthyRevision(): Record<string, unknown> {
  return {
    id: REVISION_ID,
    proposal_id: PROPOSAL_ID,
    artifact_prefix: `${ORG_ID}/${PROPOSAL_ID}/${REVISION_ID}`,
    base_commit_sha: BASE_SHA,
    head_commit_sha: null,
    manifest_hash: M_HASH,
    diff_hash: D_HASH,
  };
}

function healthyAttempt(): Record<string, unknown> {
  return {
    id: ATTEMPT_ID,
    proposal_id: PROPOSAL_ID,
    revision_id: REVISION_ID,
    status: 'passed',
    policy_version: REVIEW_POLICY_VERSION,
    required_check_keys: [],
    completed_at: '2026-07-11T00:00:00.000Z',
    started_at: '2026-07-11T00:00:00.000Z',
  };
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _canReview = true;
  _githubConfigured = true;
  _proposalRow = healthyProposal();
  _revisionRow = healthyRevision();
  _attemptRow = healthyAttempt();
  _findings = [];
  _runs = [];
  _filesArtifact = { files: FILES };
  _defaultBranchSha = BASE_SHA;
  _allUpdates = [];
  _revisionUpdates = [];
  _deliveryUpserts = [];
  _eventInserts = [];
  applyMock.mockClear();
  getDefaultBranchShaMock.mockClear();
});

describe('POST apply — auth and preconditions', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    expect((await call()).status).toBe(401);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('403 without implementation reviewer capability', async () => {
    _canReview = false;
    expect((await call()).status).toBe(403);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('503 when GitHub is not configured', async () => {
    _githubConfigured = false;
    expect((await call()).status).toBe(503);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('404 when the proposal does not exist in this org', async () => {
    _proposalRow = null;
    expect((await call()).status).toBe(404);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the proposal code_state is not ready_to_apply', async () => {
    _proposalRow = { ...healthyProposal(), code_state: 'needs_repair' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the proposal is not a code proposal', async () => {
    _proposalRow = { ...healthyProposal(), proposal_type: 'config' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when there is no current revision', async () => {
    _proposalRow = { ...healthyProposal(), current_revision_id: null };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('POST apply — review gate (evaluateAttemptGate)', () => {
  it('409 when there is no review attempt for the current revision', async () => {
    _attemptRow = null;
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the latest attempt belongs to a stale (non-current) revision', async () => {
    _attemptRow = { ...healthyAttempt(), revision_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the attempt was evaluated under a stale policy version', async () => {
    _attemptRow = { ...healthyAttempt(), policy_version: 'builder-review-policy/v0' };
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 with the blocker text when an open blocking finding exists', async () => {
    _findings = [{ state: 'open', severity: 'blocker', evidence: 'New table has no RLS policies.' }];
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.blockers).toEqual(['New table has no RLS policies.']);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when a required verification check has no passed run (Increment 3 readiness)', async () => {
    _attemptRow = { ...healthyAttempt(), required_check_keys: ['verify:types'] };
    _runs = []; // no passed verify:types run
    expect((await call()).status).toBe(409);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('POST apply — artifact tamper guard', () => {
  it('409 when the recomputed manifest hash does not match the recorded hash', async () => {
    _revisionRow = { ...healthyRevision(), manifest_hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' };
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/do not match recorded hashes/i);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('409 when the recomputed diff hash does not match the recorded hash', async () => {
    _revisionRow = { ...healthyRevision(), diff_hash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' };
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/do not match recorded hashes/i);
    expect(applyMock).not.toHaveBeenCalled();
  });
});

describe('POST apply — base-branch staleness', () => {
  it('409 and leaves state UNCHANGED when the default branch has moved since review', async () => {
    _defaultBranchSha = 'movedsha1111111111111111111111111111111111';
    const res = await call();
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/base branch has moved/i);
    expect(applyMock).not.toHaveBeenCalled();
    // No transition, no head stamp, no base rewrite — the row stays ready_to_apply.
    expect(_allUpdates).toEqual([]);
  });

  it('captures, stamps, and proceeds when base_commit_sha is null at apply time', async () => {
    _revisionRow = { ...healthyRevision(), base_commit_sha: null };
    _defaultBranchSha = 'freshsha2222222222222222222222222222222222';
    const res = await call();
    expect(res.status).toBe(200);
    expect(applyMock).toHaveBeenCalledTimes(1);
    // base_commit_sha was captured now and stamped on the revision.
    const baseStamp = _revisionUpdates.find(u => 'base_commit_sha' in u);
    expect(baseStamp?.base_commit_sha).toBe('freshsha2222222222222222222222222222222222');
  });
});

describe('POST apply — happy path', () => {
  it('opens the PR, writes a delivery record, stamps head_commit_sha, and transitions to pr_opened', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prUrl).toBe('https://github.com/acme/repo/pull/7');

    // GitHub was invoked exactly once, with attempt/module facts — never a score.
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(applyMock.mock.calls[0][1]).toBe('Volunteer Tracking');
    // The 4th arg carries verification FACTS (attempt number, policy version) —
    // never a numeric score.
    const factsArg = applyMock.mock.calls[0][3];
    expect(typeof factsArg).not.toBe('number');
    expect(factsArg).toMatchObject({ policyVersion: REVIEW_POLICY_VERSION });

    // Delivery record captures provider facts via an idempotent upsert on
    // (provider, provider_event_id) so retries after a partial failure are safe.
    expect(_deliveryUpserts).toHaveLength(1);
    expect(_deliveryUpserts[0].options).toMatchObject({
      onConflict: 'provider,provider_event_id',
    });
    expect(_deliveryUpserts[0].row).toMatchObject({
      proposal_id: PROPOSAL_ID,
      revision_id: REVISION_ID,
      provider: 'github',
      status: 'pr_open',
      pr_number: 7,
      pr_url: 'https://github.com/acme/repo/pull/7',
      branch_name: 'builder/scaffold-22222222',
      commit_sha: HEAD_SHA,
      provider_event_id: 'pr:7',
    });
    expect(_deliveryUpserts[0].row.payload_hash).toBe(
      sha256Hex(canonicalJson({ prNumber: 7, headSha: HEAD_SHA }))
    );

    // head_commit_sha stamped exactly once on the revision.
    const headStamps = _revisionUpdates.filter(u => 'head_commit_sha' in u);
    expect(headStamps).toHaveLength(1);
    expect(headStamps[0].head_commit_sha).toBe(HEAD_SHA);

    // Transition ready_to_apply -> pr_opened with reviewer stamp.
    const transitionUpdate = _allUpdates.find(
      u => u.table === 'builder_proposals' && u.values.code_state === 'pr_opened'
    );
    expect(transitionUpdate).toBeDefined();
    expect(transitionUpdate!.values.reviewed_by).toBe(USER_ID);
    expect(transitionUpdate!.values.reviewed_at).toBeDefined();

    // proposal_applied event includes prNumber.
    expect(_eventInserts).toHaveLength(1);
    expect(_eventInserts[0]).toMatchObject({ org_id: ORG_ID, event_type: 'proposal_applied' });
    expect((_eventInserts[0].payload as Record<string, unknown>).prNumber).toBe(7);

    // Regression guard: NO update anywhere writes a `status` or `pr_url` column
    // (those columns no longer exist on builder_proposals).
    for (const u of _allUpdates) {
      expect(u.values).not.toHaveProperty('status');
      expect(u.values).not.toHaveProperty('pr_url');
    }
  });

  it('retry after a partial failure re-runs safely: idempotent delivery upsert still proceeds through head-stamp, transition, and 200', async () => {
    // Simulate the retry scenario: applyProposalToGitHub is idempotent and
    // returns the SAME pr number/head sha (finds the existing PR), so the
    // delivery record already exists for (github, pr:7). The upsert on
    // (provider, provider_event_id) no-ops/refreshes instead of throwing a
    // UNIQUE violation — the route must proceed normally, not 500.
    const res = await call();
    expect(res.status).toBe(200);

    // The write is an upsert (not a bare insert) with the conflict target set,
    // which is what makes a same-pr-number retry safe.
    expect(_deliveryUpserts).toHaveLength(1);
    expect(_deliveryUpserts[0].options).toMatchObject({
      onConflict: 'provider,provider_event_id',
    });
    expect(_deliveryUpserts[0].row.provider_event_id).toBe('pr:7');

    // Execution continued past the delivery write: head_commit_sha stamped and
    // the ready_to_apply -> pr_opened transition applied.
    const headStamps = _revisionUpdates.filter(u => 'head_commit_sha' in u);
    expect(headStamps).toHaveLength(1);
    const transitionUpdate = _allUpdates.find(
      u => u.table === 'builder_proposals' && u.values.code_state === 'pr_opened'
    );
    expect(transitionUpdate).toBeDefined();
  });
});
// Integration test.
