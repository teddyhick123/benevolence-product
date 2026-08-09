// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAIInvocationRecorder } from '@/lib/api/repositories/ai-invocations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => vi.clearAllMocks());

describe('AI invocation recorder', () => {
  it('writes the complete content-free provider-neutral record', async () => {
    const query = stubQuery({ data: null, error: null });
    mockCreateElevatedClient.mockReturnValue({ from: vi.fn(() => query) });
    await createAIInvocationRecorder()({
      id: 'invocation-1',
      workloadId: 'assistant',
      operation: 'tool_conversation',
      scope: {
        kind: 'organization',
        orgId: 'org-1',
        actorId: 'user-1',
        portfolioId: 'portfolio-1',
        sessionId: 'session-1',
        turnId: 'turn-1',
      },
      connector: 'anthropic',
      requestedModel: 'requested-model',
      resolvedModel: 'resolved-model',
      usage: { inputTokens: 10, outputTokens: 5 },
      startedAt: '2026-08-08T00:00:00.000Z',
      completedAt: '2026-08-08T00:00:01.000Z',
      latencyMs: 1000,
      status: 'succeeded',
      targetPosition: 0,
      policy: {},
      policyHash: 'policy-hash',
    });

    expect(query.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        id: 'invocation-1',
        user_id: 'user-1',
        org_id: 'org-1',
        portfolio_id: 'portfolio-1',
        session_id: 'session-1',
        turn_id: 'turn-1',
        scope_kind: 'organization',
        workload_id: 'assistant',
        operation: 'tool_conversation',
        connector: 'anthropic',
        requested_model: 'requested-model',
        resolved_model: 'resolved-model',
        input_tokens: 10,
        output_tokens: 5,
        target_position: 0,
        policy_snapshot: {},
        policy_hash: 'policy-hash',
        status: 'succeeded',
      })],
    });
    expect(JSON.stringify(query.calls)).not.toContain('prompt');
    expect(JSON.stringify(query.calls)).not.toContain('response');
  });

  it('persists actor-less platform invocations', async () => {
    const query = stubQuery({ data: null, error: null });
    mockCreateElevatedClient.mockReturnValue({ from: vi.fn(() => query) });
    await createAIInvocationRecorder()({
      id: 'invocation-1',
      workloadId: 'transcription',
      operation: 'transcription',
      scope: { kind: 'platform' },
      connector: 'transcription_platform',
      requestedModel: 'whisper-1',
      startedAt: '2026-08-08T00:00:00.000Z',
      completedAt: '2026-08-08T00:00:01.000Z',
      latencyMs: 1000,
      status: 'succeeded',
      targetPosition: 0,
      policy: {},
      policyHash: 'policy-hash',
    });
    expect(mockCreateElevatedClient).toHaveBeenCalledOnce();
    expect(query.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        user_id: null,
        org_id: null,
        scope_kind: 'platform',
        connector: 'transcription_platform',
      })],
    });
  });
});
