import { describe, expect, it, vi } from 'vitest';
import type { AIConnector, AIInvocationRecord } from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import { AIExecutionGateway } from '@/lib/ai/gateway';
import { resolveAIExecution } from '@/lib/ai/resolver';

const scope = {
  kind: 'organization' as const,
  orgId: 'org-1',
  actorId: 'user-1',
  portfolioId: 'portfolio-1',
  sessionId: 'session-1',
  turnId: 'turn-1',
};

function connector(overrides: Partial<AIConnector> = {}): AIConnector {
  return {
    id: 'anthropic',
    capabilities: ['text', 'json', 'tools', 'streaming', 'parallel_tool_results'],
    generateText: vi.fn().mockResolvedValue({
      text: 'answer',
      response: {
        content: [{ type: 'text', text: 'answer' }],
        stopReason: 'end_turn',
        model: 'resolved-model',
        providerRequestId: 'request-1',
        usage: { inputTokens: 10, outputTokens: 4 },
      },
    }),
    ...overrides,
  };
}

function gateway(aiConnector: AIConnector, records: AIInvocationRecord[]) {
  return new AIExecutionGateway(scope, {
    connector: () => aiConnector,
    recorder: async (record) => { records.push(record); },
    resolver: async (executionScope, workloadId) => resolveAIExecution(executionScope, workloadId),
    now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_125),
  });
}

describe('AI execution gateway', () => {
  it('records normalized metadata without request or response content', async () => {
    const records: AIInvocationRecord[] = [];
    const runtime = gateway(connector(), records);
    const result = await runtime.generateText(await runtime.resolve('summaries'), {
      messages: [{ role: 'user', content: 'private prompt' }],
    });

    expect(result.text).toBe('answer');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      workloadId: 'summaries',
      connector: 'anthropic',
      resolvedModel: 'resolved-model',
      providerRequestId: 'request-1',
      usage: { inputTokens: 10, outputTokens: 4 },
      latencyMs: 125,
      status: 'succeeded',
      scope,
    });
    expect(JSON.stringify(records[0])).not.toContain('private prompt');
    expect(records[0]).not.toHaveProperty('request');
    expect(records[0]).not.toHaveProperty('response');
  });

  it('records normalized provider failures and hides native messages', async () => {
    const records: AIInvocationRecord[] = [];
    const nativeError = Object.assign(new Error('native secret payload'), { status: 429 });
    const runtime = gateway(
      connector({ generateText: vi.fn().mockRejectedValue(nativeError) }),
      records,
    );

    await expect(
      runtime.generateText(await runtime.resolve('summaries'), {
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    expect(records[0]).toMatchObject({
      workloadId: 'summaries',
      status: 'failed',
      errorCode: 'rate_limited',
    });
    expect(JSON.stringify(records[0])).not.toContain('native secret payload');
  });

  it('does not let recorder failure replace a successful result', async () => {
    const onRecorderError = vi.fn();
    const runtime = new AIExecutionGateway(scope, {
      connector: () => connector(),
      recorder: vi.fn().mockRejectedValue(new Error('telemetry unavailable')),
      resolver: async (executionScope, workloadId) => resolveAIExecution(executionScope, workloadId),
      onRecorderError,
    });

    await expect(
      runtime.generateText(await runtime.resolve('summaries'), {
        messages: [{ role: 'user', content: 'hello' }],
      }),
    ).resolves.toMatchObject({ text: 'answer' });
    expect(onRecorderError).toHaveBeenCalledOnce();
  });

  it('propagates an already-aborted request and records it as aborted', async () => {
    const records: AIInvocationRecord[] = [];
    const controller = new AbortController();
    controller.abort('caller cancelled');
    const generateText = vi.fn(async (_plan, request) => {
      expect(request.signal?.aborted).toBe(true);
      throw new DOMException('aborted', 'AbortError');
    });
    const runtime = gateway(connector({ generateText }), records);

    await expect(
      runtime.generateText(await runtime.resolve('summaries'), {
        messages: [{ role: 'user', content: 'hello' }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(generateText).toHaveBeenCalledOnce();
    expect(records[0]).toMatchObject({ status: 'aborted', errorCode: 'aborted' });
  });

  it('aborts requests at the resolved timeout and records a timeout', async () => {
    const records: AIInvocationRecord[] = [];
    const generateText = vi.fn((_plan, request) => new Promise<never>((_resolve, reject) => {
      request.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('aborted', 'AbortError')),
        { once: true },
      );
    }));
    const runtime = gateway(connector({ generateText }), records);
    const plan = { ...await runtime.resolve('summaries'), timeoutMs: 1 };

    await expect(
      runtime.generateText(plan, { messages: [{ role: 'user', content: 'hello' }] }),
    ).rejects.toMatchObject({ code: 'timeout' });
    expect(records[0]).toMatchObject({ status: 'timed_out', errorCode: 'timeout' });
  });

  it('records terminal streaming usage', async () => {
    const records: AIInvocationRecord[] = [];
    async function* stream() {
      yield {
        type: 'message_start' as const,
        model: 'resolved-model',
        providerRequestId: 'provider-1',
        usage: { inputTokens: 12, outputTokens: 0 },
      };
      yield { type: 'text_delta' as const, text: 'hello' };
      yield {
        type: 'message_stop' as const,
        stopReason: 'end_turn',
        usage: { inputTokens: 0, outputTokens: 7 },
      };
    }
    const runtime = gateway(
      connector({ streamToolConversation: () => stream() }),
      records,
    );
    const chunks = [];
    for await (const chunk of runtime.streamToolConversation(
      await runtime.resolve('assistant'),
      { messages: [{ role: 'user', content: 'hello' }], tools: [] },
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(records[0]).toMatchObject({
      status: 'succeeded',
      resolvedModel: 'resolved-model',
      providerRequestId: 'provider-1',
      usage: { inputTokens: 12, outputTokens: 7 },
    });
  });

  it('falls back only for an eligible failure and records each target', async () => {
    const records: AIInvocationRecord[] = [];
    const primary = connector({
      generateText: vi.fn().mockRejectedValue(
        new AIExecutionError('deployment_unavailable', 'unavailable'),
      ),
    });
    const fallback = connector();
    const runtime = new AIExecutionGateway(scope, {
      connector: plan => plan.targetPosition === 0 ? primary : fallback,
      recorder: async record => { records.push(record); },
      resolver: async (executionScope, workloadId) => {
        const base = resolveAIExecution(executionScope, workloadId);
        return {
          ...base,
          policy: { fallbackOn: ['deployment_unavailable'] },
          targets: [
            base.targets[0],
            { ...base.targets[0], position: 1 },
          ],
        };
      },
    });
    const plan = await runtime.resolve('summaries');
    await expect(runtime.generateText(plan, {
      messages: [{ role: 'user', content: 'hello' }],
    })).resolves.toMatchObject({ text: 'answer' });
    expect(records.map(record => [record.targetPosition, record.status])).toEqual([
      [0, 'failed'],
      [1, 'succeeded'],
    ]);
  });

  it('never falls back after the first stream event is accepted', async () => {
    const records: AIInvocationRecord[] = [];
    async function* partialFailure() {
      yield { type: 'message_start' as const, model: 'primary' };
      throw new AIExecutionError('deployment_unavailable', 'mid-stream');
    }
    const fallbackStream = vi.fn(async function* () {
      yield { type: 'message_start' as const, model: 'fallback' };
      yield { type: 'message_stop' as const, stopReason: 'end_turn' };
    });
    const runtime = new AIExecutionGateway(scope, {
      connector: plan => connector({
        streamToolConversation: plan.targetPosition === 0 ? partialFailure : fallbackStream,
      }),
      recorder: async record => { records.push(record); },
      resolver: async (executionScope, workloadId) => {
        const base = resolveAIExecution(executionScope, workloadId);
        return {
          ...base,
          policy: { fallbackOn: ['deployment_unavailable'] },
          targets: [base.targets[0], { ...base.targets[0], position: 1 }],
        };
      },
    });
    const plan = await runtime.resolve('assistant');
    const consume = async () => {
      for await (const _chunk of runtime.streamToolConversation(plan, {
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
      })) { /* consume */ }
    };
    await expect(consume()).rejects.toMatchObject({ code: 'deployment_unavailable' });
    expect(fallbackStream).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
  });

  it('rejects organization execution without an organization id', async () => {
    const runtime = new AIExecutionGateway(
      { kind: 'organization', actorId: 'user-1' },
      { connector: () => connector(), recorder: async () => {} },
    );
    await expect(runtime.resolve('assistant')).rejects.toBeInstanceOf(AIExecutionError);
  });
});
