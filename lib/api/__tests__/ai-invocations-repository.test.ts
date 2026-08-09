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

describe('AI invocation recorder Phase 0 projection', () => {
  it('writes only compatible non-content usage metadata', async () => {
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
    });

    expect(query.calls).toContainEqual({
      method: 'insert',
      args: [{
        user_id: 'user-1',
        org_id: 'org-1',
        portfolio_id: 'portfolio-1',
        session_id: 'session-1',
        model: 'resolved-model',
        input_tokens: 10,
        output_tokens: 5,
      }],
    });
  });

  it('does not construct elevated access for an unrepresentable actor', async () => {
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
    });
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });
});
