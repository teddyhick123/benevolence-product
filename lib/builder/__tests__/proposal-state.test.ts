// lib/builder/__tests__/proposal-state.test.ts
//
// Task 2 — typed domain models + transition service for the code_state
// machine (Builder Increment 2 durable data contract). Covers the exhaustive
// 11x11 transition matrix, the CAS-based transitionProposal/failInFlightRun
// helpers, and the claimCodeRun RPC error-code mapping.

import { describe, it, expect } from 'vitest';
import {
  CODE_STATES,
  type CodeState,
  PROPOSAL_STATE_POLICY_VERSION,
  REVIEW_POLICY_VERSION,
  REQUIRED_CHECK_KEYS,
  CLAIMABLE_STATES,
  IN_FLIGHT_STATES,
  TERMINAL_STATES,
  canTransition,
  assertTransition,
  isTerminalState,
  ProposalStateError,
  codeStateLabel,
  codeStateNextStep,
  transitionProposal,
  failInFlightRun,
  claimCodeRun,
} from '@/lib/builder/proposal-state';
import { SupabaseMock } from './helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const PROPOSAL_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REVISION_ID = '33333333-3333-3333-3333-333333333333';
const TABLE = 'builder_proposals';

// Mirrors the brief's transition table exactly.
const ALLOWED: Record<CodeState, CodeState[]> = {
  plan_ready: ['queued', 'rejected'],
  queued: ['generating', 'verifying', 'failed'],
  generating: ['verifying', 'failed'],
  verifying: ['needs_repair', 'ready_to_apply', 'failed', 'rejected'],
  needs_repair: ['queued', 'rejected'],
  ready_to_apply: ['pr_opened', 'queued', 'rejected'],
  pr_opened: ['merged', 'needs_repair', 'rejected'],
  merged: ['deployed'],
  deployed: [],
  rejected: [],
  failed: ['queued', 'rejected'],
};

describe('CODE_STATES and policy constants', () => {
  it('lists the 11 canonical states in the documented order', () => {
    expect(CODE_STATES).toEqual([
      'plan_ready', 'queued', 'generating', 'verifying', 'needs_repair',
      'ready_to_apply', 'pr_opened', 'merged', 'deployed', 'rejected', 'failed',
    ]);
    expect(CODE_STATES.length).toBe(11);
  });

  it('exposes stable policy version strings', () => {
    expect(PROPOSAL_STATE_POLICY_VERSION).toBe('builder-state/v1');
    expect(REVIEW_POLICY_VERSION).toBe('builder-review-policy/v1');
  });

  it('REQUIRED_CHECK_KEYS is empty pending Increment 3', () => {
    expect(REQUIRED_CHECK_KEYS).toEqual([]);
  });

  it('CLAIMABLE_STATES / IN_FLIGHT_STATES / TERMINAL_STATES match the spec', () => {
    expect(CLAIMABLE_STATES).toEqual(['plan_ready', 'needs_repair', 'failed']);
    expect(IN_FLIGHT_STATES).toEqual(['queued', 'generating', 'verifying']);
    expect(TERMINAL_STATES).toEqual(['deployed', 'rejected']);
  });
});

const ALL_PAIRS: Array<[CodeState, CodeState]> = CODE_STATES.flatMap((from) =>
  CODE_STATES.map((to) => [from, to] as [CodeState, CodeState])
);

describe('canTransition — exhaustive 11x11 matrix (121 ordered pairs)', () => {
  it('covers exactly 121 ordered pairs', () => {
    expect(ALL_PAIRS.length).toBe(121);
  });

  it.each(ALL_PAIRS)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(ALLOWED[from].includes(to));
  });
});

describe('assertTransition', () => {
  it('does not throw for an allowed pair', () => {
    expect(() => assertTransition('plan_ready', 'queued')).not.toThrow();
  });

  it('throws ProposalStateError for a denied pair', () => {
    expect(() => assertTransition('plan_ready', 'generating')).toThrow(ProposalStateError);
  });

  it('the thrown error carries the from/to states', () => {
    let caught: unknown;
    try {
      assertTransition('deployed', 'queued');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProposalStateError);
    expect((caught as ProposalStateError).from).toBe('deployed');
    expect((caught as ProposalStateError).to).toBe('queued');
  });
});

describe('isTerminalState', () => {
  it('is true only for deployed and rejected', () => {
    for (const state of CODE_STATES) {
      expect(isTerminalState(state)).toBe(state === 'deployed' || state === 'rejected');
    }
  });
});

describe('codeStateLabel / codeStateNextStep', () => {
  it('returns a non-empty label and next-step string for every state', () => {
    for (const state of CODE_STATES) {
      const label = codeStateLabel(state);
      const nextStep = codeStateNextStep(state);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(typeof nextStep).toBe('string');
      expect(nextStep.length).toBeGreaterThan(0);
    }
  });
});

describe('transitionProposal', () => {
  it('issues the CAS update with the exact eq() chain and returns {ok:true} on a matched row', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: { code_state: 'queued' }, error: null });

    const result = await transitionProposal(mock.client(), {
      proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'queued',
    });

    expect(result).toEqual({ ok: true });
    const updateCall = mock.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ code_state: 'queued' });
    const eqCalls = mock.calls.filter((c) => c.method === 'eq').map((c) => c.args);
    expect(eqCalls).toEqual([
      ['id', PROPOSAL_ID],
      ['org_id', ORG_ID],
      ['code_state', 'plan_ready'],
    ]);
    const selectCall = mock.calls.find((c) => c.method === 'select');
    expect(selectCall?.args).toEqual(['code_state']);
  });

  it('merges extra `set` fields into the update payload', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: { code_state: 'rejected' }, error: null });

    await transitionProposal(mock.client(), {
      proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'rejected',
      set: { rejected_reason: 'policy violation' },
    });

    const updateCall = mock.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ code_state: 'rejected', rejected_reason: 'policy violation' });
  });

  it('returns {ok:true, idempotent:true} when 0 rows matched but a re-read shows the target state', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: null }); // CAS update: no row matched
    mock.queueTable(TABLE, { data: { code_state: 'queued' }, error: null }); // re-read

    const result = await transitionProposal(mock.client(), {
      proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'queued',
    });

    expect(result).toEqual({ ok: true, idempotent: true });
  });

  it('returns {ok:false, currentState} when 0 rows matched and the row is in a different state', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: null });
    mock.queueTable(TABLE, { data: { code_state: 'needs_repair' }, error: null });

    const result = await transitionProposal(mock.client(), {
      proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'queued',
    });

    expect(result).toEqual({ ok: false, currentState: 'needs_repair' });
  });

  it('returns {ok:false, currentState:null} when 0 rows matched and the row no longer exists', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: null });
    mock.queueTable(TABLE, { data: null, error: null });

    const result = await transitionProposal(mock.client(), {
      proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'queued',
    });

    expect(result).toEqual({ ok: false, currentState: null });
  });

  it('throws on an unexpected database error from the CAS update', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: { message: 'connection reset' } });

    await expect(
      transitionProposal(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, from: 'plan_ready', to: 'queued' })
    ).rejects.toThrow('connection reset');
  });
});

describe('failInFlightRun', () => {
  it('CASes in-flight states to failed via .in(code_state, IN_FLIGHT_STATES)', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: null });

    await failInFlightRun(mock.client(), PROPOSAL_ID);

    const updateCall = mock.calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toEqual({ code_state: 'failed' });
    const inCall = mock.calls.find((c) => c.method === 'in');
    expect(inCall?.args).toEqual(['code_state', IN_FLIGHT_STATES]);
    const eqCall = mock.calls.find((c) => c.method === 'eq');
    expect(eqCall?.args).toEqual(['id', PROPOSAL_ID]);
  });

  it('is a no-op from terminal states (does not throw when 0 rows match)', async () => {
    const mock = new SupabaseMock();
    // Postgrest reports {error: null} whether the CAS matched 0 or N rows;
    // failInFlightRun is fire-and-forget and never re-reads to distinguish.
    mock.queueTable(TABLE, { data: null, error: null });

    await expect(failInFlightRun(mock.client(), PROPOSAL_ID)).resolves.toBeUndefined();
  });

  it('throws on an unexpected database error', async () => {
    const mock = new SupabaseMock();
    mock.queueTable(TABLE, { data: null, error: { message: 'db down' } });

    await expect(failInFlightRun(mock.client(), PROPOSAL_ID)).rejects.toThrow('db down');
  });
});

describe('claimCodeRun', () => {
  it('maps a successful RPC row to {ok:true, revisionId, reused}', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', { data: [{ revision_id: REVISION_ID, reused: true }], error: null });

    const result = await claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID });

    expect(result).toEqual({ ok: true, revisionId: REVISION_ID, reused: true });
    const rpcCall = mock.calls.find((c) => c.method === 'rpc');
    expect(rpcCall?.args).toEqual([
      'builder_claim_code_run',
      { p_proposal_id: PROPOSAL_ID, p_org_id: ORG_ID, p_actor: ACTOR_ID },
    ]);
  });

  it('maps a non-array single-row RPC response the same way', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', { data: { revision_id: REVISION_ID, reused: false }, error: null });

    const result = await claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID });

    expect(result).toEqual({ ok: true, revisionId: REVISION_ID, reused: false });
  });

  it('maps P0032 (not found) to {ok:false, code:"not_found"}', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', { data: null, error: { code: 'P0032', message: 'builder_claim_not_found' } });

    const result = await claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID });

    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  it('maps P0033 (claim conflict) to {ok:false, code:"conflict", currentState} parsed from the message', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', {
      data: null,
      error: { code: 'P0033', message: 'builder_claim_conflict: state queued' },
    });

    const result = await claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID });

    expect(result).toEqual({ ok: false, code: 'conflict', currentState: 'queued' });
  });

  it('maps P0034 (no revision) to {ok:false, code:"no_revision"}', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', { data: null, error: { code: 'P0034', message: 'builder_claim_no_revision' } });

    const result = await claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID });

    expect(result).toEqual({ ok: false, code: 'no_revision' });
  });

  it('rethrows unrecognized Postgres errors', async () => {
    const mock = new SupabaseMock();
    mock.queueRpc('builder_claim_code_run', { data: null, error: { code: '23505', message: 'unique violation' } });

    await expect(
      claimCodeRun(mock.client(), { proposalId: PROPOSAL_ID, orgId: ORG_ID, actorId: ACTOR_ID })
    ).rejects.toThrow('unique violation');
  });
});
