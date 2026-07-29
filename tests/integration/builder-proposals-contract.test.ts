// @vitest-environment node
//
// Tests for GET /api/org/[orgId]/builder/proposals (list, summary-only)
// and GET /api/org/[orgId]/builder/proposals/[proposalId] (detail, full
// evidence). Builder Increment 2 durable data contract, Task 9.
//
// LIST is a security-relevant contract: it must never leak source code,
// finding evidence bodies, or raw model review output anywhere in the
// payload — a recursive walk asserts no key named content/generated_code/
// review_report/evidence appears anywhere in the tree, not just at the
// top level. Aggregate counts (blocker/warning/checks) are computed from
// batched queries, not per-proposal N+1 lookups.
//
// DETAIL exposes full evidence: nested findings/verification runs per
// attempt (across ALL revisions, newest attempt-first) and signed artifact
// URLs for the current revision's diff/files/context artifacts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG_ID = '99999999-9999-9999-9999-999999999999';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CONFIG_PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const CODE_PROPOSAL_ID = '33333333-3333-3333-3333-333333333333';
const REVISION_ID = '44444444-4444-4444-4444-444444444444';
const ATTEMPT_ID = '55555555-5555-5555-5555-555555555555';
const OLD_REVISION_ID = '66666666-6666-6666-6666-666666666666';
const OLD_ATTEMPT_ID = '77777777-7777-7777-7777-777777777777';
const REQUESTER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ── shared fixture state (mutated per test) ─────────────────────────────────
let _authUser: { id: string } | null;
let _isAdmin: boolean;
let _proposals: Array<Record<string, unknown>>;
let _profiles: Array<Record<string, unknown>>;
let _revisions: Array<Record<string, unknown>>;
let _attempts: Array<Record<string, unknown>>;
let _findings: Array<Record<string, unknown>>;
let _runs: Array<Record<string, unknown>>;
let _deliveries: Array<Record<string, unknown>>;

interface MockState {
  table: string;
  filters: Record<string, unknown>;
  inFilters: Record<string, unknown[]>;
  terminal: 'array' | 'single';
}

function computeResult(state: MockState): { data: unknown; error: unknown } {
  const { table, filters, inFilters, terminal } = state;
  switch (table) {
    case 'builder_proposals': {
      if (terminal === 'single') {
        const row = _proposals.find(p => p.id === filters.id && p.org_id === filters.org_id);
        return { data: row ?? null, error: null };
      }
      return { data: _proposals.filter(p => p.org_id === filters.org_id), error: null };
    }
    case 'profiles':
      return { data: _profiles.filter(p => (inFilters.id ?? []).includes(p.id)), error: null };
    case 'builder_proposal_revisions': {
      if (terminal === 'single') {
        const row = _revisions.find(r => r.id === filters.id);
        return { data: row ?? null, error: null };
      }
      return { data: _revisions.filter(r => (inFilters.id ?? []).includes(r.id)), error: null };
    }
    case 'builder_review_attempts': {
      if (inFilters.revision_id) {
        return { data: _attempts.filter(a => inFilters.revision_id!.includes(a.revision_id)), error: null };
      }
      if (filters.proposal_id) {
        return { data: _attempts.filter(a => a.proposal_id === filters.proposal_id), error: null };
      }
      return { data: _attempts, error: null };
    }
    case 'builder_review_findings':
      return { data: _findings.filter(f => (inFilters.review_attempt_id ?? []).includes(f.review_attempt_id)), error: null };
    case 'builder_verification_runs':
      return { data: _runs.filter(r => (inFilters.review_attempt_id ?? []).includes(r.review_attempt_id)), error: null };
    case 'builder_delivery_records': {
      if (inFilters.proposal_id) {
        return { data: _deliveries.filter(d => inFilters.proposal_id!.includes(d.proposal_id)), error: null };
      }
      if (filters.proposal_id) {
        return { data: _deliveries.filter(d => d.proposal_id === filters.proposal_id), error: null };
      }
      return { data: _deliveries, error: null };
    }
    default:
      throw new Error(`unexpected table ${table}`);
  }
}

function makeQB(table: string) {
  const state: MockState = { table, filters: {}, inFilters: {}, terminal: 'array' };
  const qb: Record<string, unknown> = {
    select: () => qb,
    order: () => qb,
    limit: () => qb,
    eq: (col: string, val: unknown) => {
      state.filters[col] = val;
      return qb;
    },
    in: (col: string, vals: unknown[]) => {
      state.inFilters[col] = vals;
      return qb;
    },
    maybeSingle: async () => {
      state.terminal = 'single';
      return computeResult(state);
    },
    single: async () => {
      state.terminal = 'single';
      return computeResult(state);
    },
    then: (onF: (_value: unknown) => unknown, onR?: (_error: unknown) => unknown) =>
      Promise.resolve(computeResult(state)).then(onF, onR),
  };
  return qb;
}

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: vi.fn(async () => {
    if (!_authUser) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    if (!_isAdmin) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      };
    }
    return { ok: true, context: { user: _authUser, role: 'admin' } };
  }),
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({
    from: (table: string) => makeQB(table),
  })),
}));

const signArtifactUrlMock = vi.fn(async (_admin: unknown, key: string) => `https://signed.example/${key}`);
const readJsonArtifactMock = vi.fn(async (): Promise<{ entries: { path: string; bytes: number }[]; fileCount: number; totalBytes: number } | null> => ({
  entries: [{ path: 'components/Foo.tsx', bytes: 42 }],
  fileCount: 1,
  totalBytes: 42,
}));

vi.mock('@/lib/builder/artifacts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/builder/artifacts')>();
  return {
    ...actual,
    signArtifactUrl: (...args: unknown[]) => signArtifactUrlMock(...(args as [unknown, string])),
    readJsonArtifact: (...args: unknown[]) => readJsonArtifactMock(...(args as [])),
  };
});

import { GET as listGET } from '@/app/api/org/[orgId]/builder/proposals/route';
import { GET as detailGET } from '@/app/api/org/[orgId]/builder/proposals/[proposalId]/route';

function callList(orgId = ORG_ID) {
  return listGET(new NextRequest('http://localhost/api/proposals'), {
    params: Promise.resolve({ orgId }),
  });
}

function callDetail(proposalId: string, orgId = ORG_ID) {
  return detailGET(new NextRequest('http://localhost/api/proposals/x'), {
    params: Promise.resolve({ orgId, proposalId }),
  });
}

// ── recursive banned-key walk ────────────────────────────────────────────────
const BANNED_KEYS = ['content', 'generated_code', 'review_report', 'evidence'];

function findBannedKey(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findBannedKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (BANNED_KEYS.includes(key)) return `${path}.${key}`;
      const hit = findBannedKey(val, `${path}.${key}`);
      if (hit) return hit;
    }
  }
  return null;
}

function configProposal(): Record<string, unknown> {
  return {
    id: CONFIG_PROPOSAL_ID,
    org_id: ORG_ID,
    requested_by: REQUESTER_ID,
    proposal_type: 'config',
    status: 'pending',
    config_patch: { module: 'grant_management', enabled: true },
    reviewer_notes: null,
    code_state: null,
    rejected_reason: null,
    current_revision_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
  };
}

function codeProposal(): Record<string, unknown> {
  return {
    id: CODE_PROPOSAL_ID,
    org_id: ORG_ID,
    requested_by: REQUESTER_ID,
    proposal_type: 'code',
    status: null,
    config_patch: null,
    reviewer_notes: null,
    code_state: 'verifying',
    rejected_reason: null,
    current_revision_id: REVISION_ID,
    plan_content: {
      moduleName: 'Volunteer Tracking',
      moduleSlug: 'volunteer_tracking',
      moduleIcon: 'users',
      tables: [],
      files: [
        { path: 'components/volunteer/VolunteerList.tsx', description: 'List view' },
        { path: 'app/api/org/[orgId]/volunteers/route.ts', description: 'API route' },
      ],
      registryEntry: '',
      apiShape: '',
    },
    created_at: '2026-07-02T00:00:00.000Z',
  };
}

function revisionRow(): Record<string, unknown> {
  return {
    id: REVISION_ID,
    proposal_id: CODE_PROPOSAL_ID,
    revision_number: 1,
    parent_revision_id: null,
    kind: 'scaffold_generation',
    base_commit_sha: 'basesha0000000000000000000000000000000000',
    head_commit_sha: null,
    manifest_hash: 'deadbeef',
    diff_hash: 'deadbeef',
    context_hash: 'deadbeef',
    artifact_prefix: `${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}`,
    file_count: 2,
    total_bytes: 900,
    progress: null,
    created_at: '2026-07-02T00:05:00.000Z',
  };
}

function attemptRow(): Record<string, unknown> {
  return {
    id: ATTEMPT_ID,
    proposal_id: CODE_PROPOSAL_ID,
    revision_id: REVISION_ID,
    attempt_number: 2,
    trigger: 'retry',
    status: 'blocked',
    policy_version: 'builder-review-policy/v2',
    required_check_keys: ['verify:types', 'verify:lint'],
    summary_score: 62,
    started_at: '2026-07-02T00:10:00.000Z',
    completed_at: '2026-07-02T00:12:00.000Z',
    decision_reason: 'Open blocking findings',
  };
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _isAdmin = true;
  _proposals = [configProposal(), codeProposal()];
  _profiles = [{ id: REQUESTER_ID, full_name: 'Riley Requester', email: 'riley@example.com' }];
  _revisions = [revisionRow()];
  _attempts = [attemptRow()];
  _findings = [
    { id: 'f1', review_attempt_id: ATTEMPT_ID, reviewer_kind: 'automated_review', severity: 'blocker', category: 'security', rule_id: 'no-raw-sql', file_path: 'a.ts', line_start: 1, line_end: 2, evidence: 'raw SQL string concatenation', recommendation: 'use parameterized queries', state: 'open' },
    { id: 'f2', review_attempt_id: ATTEMPT_ID, reviewer_kind: 'automated_review', severity: 'blocker', category: 'security', rule_id: 'missing-rls', file_path: 'b.sql', line_start: 5, line_end: 5, evidence: 'no RLS policy', recommendation: 'add RLS', state: 'open' },
    { id: 'f3', review_attempt_id: ATTEMPT_ID, reviewer_kind: 'automated_review', severity: 'warning', category: 'style', rule_id: null, file_path: 'c.tsx', line_start: 10, line_end: 10, evidence: 'unused import', recommendation: 'remove import', state: 'open' },
    { id: 'f4', review_attempt_id: ATTEMPT_ID, reviewer_kind: 'automated_review', severity: 'blocker', category: 'security', rule_id: 'dead', file_path: 'd.ts', line_start: 1, line_end: 1, evidence: 'a resolved blocker, must not be counted', recommendation: 'n/a', state: 'resolved' },
  ];
  _runs = [
    { id: 'r1', review_attempt_id: ATTEMPT_ID, check_key: 'verify:types', status: 'passed', exit_code: 0, duration_ms: 1200, log_artifact_key: `${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}/checks/verify:types.log` },
    // verify:lint has no run row at all -> pending
  ];
  _deliveries = [
    { id: 'd1', proposal_id: CODE_PROPOSAL_ID, revision_id: REVISION_ID, provider: 'github', pr_number: 7, pr_url: 'https://github.com/acme/repo/pull/7', branch_name: 'builder/x', commit_sha: 'headsha', environment: null, status: 'pr_open', created_at: '2026-07-02T00:20:00.000Z' },
  ];
  signArtifactUrlMock.mockClear();
  readJsonArtifactMock.mockClear();
});

// ============================================================
// LIST
// ============================================================

describe('GET /builder/proposals — auth', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    const res = await callList();
    expect(res.status).toBe(401);
  });

  it('403 when not an org admin', async () => {
    _isAdmin = false;
    const res = await callList();
    expect(res.status).toBe(403);
  });
});

describe('GET /builder/proposals — security: no source code or finding bodies anywhere', () => {
  it('the payload contains no key named content, generated_code, review_report, or evidence at any depth', async () => {
    const res = await callList();
    expect(res.status).toBe(200);
    const body = await res.json();
    const hit = findBannedKey(body);
    expect(hit).toBeNull();
  });
});

describe('GET /builder/proposals — shape and aggregation', () => {
  it('returns config and code proposal summaries with requested_by_name resolved', async () => {
    const res = await callList();
    const body = await res.json();
    expect(body.proposals).toHaveLength(2);

    const config = body.proposals.find((p: any) => p.id === CONFIG_PROPOSAL_ID);
    expect(config).toMatchObject({
      id: CONFIG_PROPOSAL_ID,
      requested_by_name: 'Riley Requester',
      proposal_type: 'config',
      config: { status: 'pending', config_patch: { module: 'grant_management', enabled: true }, reviewer_notes: null },
      code: null,
    });

    const code = body.proposals.find((p: any) => p.id === CODE_PROPOSAL_ID);
    expect(code.config).toBeNull();
    expect(code.code.code_state).toBe('verifying');
    expect(code.code.revision).toMatchObject({
      id: REVISION_ID,
      revision_number: 1,
      kind: 'scaffold_generation',
      file_count: 2,
      total_bytes: 900,
    });
  });

  it('computes blocker_count/warning_count from OPEN findings only (2 open blockers + 1 open warning, resolved blocker excluded)', async () => {
    const res = await callList();
    const body = await res.json();
    const code = body.proposals.find((p: any) => p.id === CODE_PROPOSAL_ID);
    expect(code.code.latest_attempt).toMatchObject({
      status: 'blocked',
      policy_version: 'builder-review-policy/v2',
      blocker_count: 2,
      warning_count: 1,
      summary_score: 62,
    });
  });

  it('derives checks required/passed/failed/pending from required_check_keys vs verification runs', async () => {
    const res = await callList();
    const body = await res.json();
    const code = body.proposals.find((p: any) => p.id === CODE_PROPOSAL_ID);
    // required_check_keys: ['verify:types', 'verify:lint']; verify:types passed, verify:lint has no run -> pending
    expect(code.code.checks).toEqual({ required: 2, passed: 1, failed: 0, pending: 1 });
  });

  it('treats an empty required_check_keys as trivially satisfied (required:0, all zero)', async () => {
    _attempts = [{ ...attemptRow(), required_check_keys: [] }];
    _runs = [];
    const res = await callList();
    const body = await res.json();
    const code = body.proposals.find((p: any) => p.id === CODE_PROPOSAL_ID);
    expect(code.code.checks).toEqual({ required: 0, passed: 0, failed: 0, pending: 0 });
  });

  it('surfaces the latest delivery record status/pr_url/pr_number', async () => {
    const res = await callList();
    const body = await res.json();
    const code = body.proposals.find((p: any) => p.id === CODE_PROPOSAL_ID);
    expect(code.code.delivery).toEqual({ status: 'pr_open', pr_url: 'https://github.com/acme/repo/pull/7', pr_number: 7 });
  });

  it('a code proposal with no revision yet (plan_ready, no current_revision_id) has null revision/latest_attempt and zeroed checks', async () => {
    _proposals = [{ ...codeProposal(), code_state: 'plan_ready', current_revision_id: null }];
    _revisions = [];
    _attempts = [];
    _findings = [];
    _runs = [];
    const res = await callList();
    const body = await res.json();
    expect(body.proposals[0].code.revision).toBeNull();
    expect(body.proposals[0].code.latest_attempt).toBeNull();
    expect(body.proposals[0].code.checks).toEqual({ required: 0, passed: 0, failed: 0, pending: 0 });
  });

  it('never calls storage (list route touches no artifacts)', async () => {
    await callList();
    expect(signArtifactUrlMock).not.toHaveBeenCalled();
    expect(readJsonArtifactMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// DETAIL
// ============================================================

describe('GET /builder/proposals/[proposalId] — auth and not found', () => {
  it('401 when unauthenticated', async () => {
    _authUser = null;
    const res = await callDetail(CODE_PROPOSAL_ID);
    expect(res.status).toBe(401);
  });

  it('403 when not an org admin', async () => {
    _isAdmin = false;
    const res = await callDetail(CODE_PROPOSAL_ID);
    expect(res.status).toBe(403);
  });

  it('404 for a proposal that belongs to another org', async () => {
    const res = await callDetail(CODE_PROPOSAL_ID, OTHER_ORG_ID);
    expect(res.status).toBe(404);
  });

  it('404 for an unknown proposal id', async () => {
    const res = await callDetail('00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('GET /builder/proposals/[proposalId] — shape', () => {
  it('returns proposal, current revision (with manifest), attempts with nested findings/runs, delivery, and signed artifact urls', async () => {
    const res = await callDetail(CODE_PROPOSAL_ID);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.proposal).toMatchObject({
      id: CODE_PROPOSAL_ID,
      proposal_type: 'code',
      code_state: 'verifying',
      plan_summary: {
        moduleName: 'Volunteer Tracking',
        plannedPaths: ['components/volunteer/VolunteerList.tsx', 'app/api/org/[orgId]/volunteers/route.ts'],
      },
    });

    expect(body.revision).toMatchObject({
      id: REVISION_ID,
      revision_number: 1,
      kind: 'scaffold_generation',
      manifest: { entries: [{ path: 'components/Foo.tsx', bytes: 42 }], fileCount: 1, totalBytes: 42 },
    });

    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]).toMatchObject({
      id: ATTEMPT_ID,
      attempt_number: 2,
      status: 'blocked',
      required_check_keys: ['verify:types', 'verify:lint'],
    });
    expect(body.attempts[0].findings).toHaveLength(4);
    expect(body.attempts[0].verification_runs).toEqual([
      { check_key: 'verify:types', status: 'passed', exit_code: 0, duration_ms: 1200, log_url: `https://signed.example/${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}/checks/verify:types.log` },
    ]);

    expect(body.delivery).toHaveLength(1);
    expect(body.delivery[0]).toMatchObject({ pr_number: 7, status: 'pr_open' });

    expect(body.artifacts).toEqual({
      diff_url: `https://signed.example/${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}/diff.patch`,
      files_url: `https://signed.example/${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}/files.json`,
      context_url: `https://signed.example/${ORG_ID}/${CODE_PROPOSAL_ID}/${REVISION_ID}/context.json`,
    });
    // Exactly one signed-URL call per present revision artifact (diff/files/context).
    expect(signArtifactUrlMock).toHaveBeenCalledTimes(4); // 3 revision artifacts + 1 verification-run log
  });

  it('attempts span ALL revisions of the proposal, newest attempt first', async () => {
    _revisions = [revisionRow(), { ...revisionRow(), id: OLD_REVISION_ID, revision_number: 0, created_at: '2026-07-01T23:00:00.000Z' }];
    _attempts = [
      attemptRow(),
      { ...attemptRow(), id: OLD_ATTEMPT_ID, revision_id: OLD_REVISION_ID, attempt_number: 1, started_at: '2026-07-01T23:05:00.000Z', completed_at: '2026-07-01T23:06:00.000Z' },
    ];
    const res = await callDetail(CODE_PROPOSAL_ID);
    const body = await res.json();
    expect(body.attempts.map((a: any) => a.id)).toEqual([ATTEMPT_ID, OLD_ATTEMPT_ID]);
  });

  it('revision is null and manifest is not fetched when the proposal has no current_revision_id yet', async () => {
    _proposals = [{ ...codeProposal(), current_revision_id: null }];
    _revisions = [];
    _attempts = [];
    const res = await callDetail(CODE_PROPOSAL_ID);
    const body = await res.json();
    expect(body.revision).toBeNull();
    expect(body.artifacts).toEqual({ diff_url: null, files_url: null, context_url: null });
    expect(readJsonArtifactMock).not.toHaveBeenCalled();
    expect(signArtifactUrlMock).not.toHaveBeenCalled();
  });

  it('manifest is null (not a 500) when the manifest artifact cannot be parsed (generation in progress)', async () => {
    readJsonArtifactMock.mockResolvedValueOnce(null);
    const res = await callDetail(CODE_PROPOSAL_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revision.manifest).toBeNull();
  });

  it('a config proposal has null revision, empty attempts/delivery, and null artifacts', async () => {
    const res = await callDetail(CONFIG_PROPOSAL_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revision).toBeNull();
    expect(body.attempts).toEqual([]);
    expect(body.delivery).toEqual([]);
    expect(body.proposal.plan_summary).toBeNull();
  });
});
// Integration test.
