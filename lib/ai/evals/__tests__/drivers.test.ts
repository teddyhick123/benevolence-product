// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { DRIVERS } from '@/lib/ai/evals/drivers';
import { streamsProgressively } from '@/lib/ai/evals/assertions';
import { FakeConnector } from '@/lib/ai/evals/testing/fake-connector';
import { EvalTransportError } from '@/lib/ai/evals/types';
import { AIExecutionError } from '@/lib/ai/execution';
import type { EvalCase } from '@/lib/ai/evals/types';

const PLAN = {
  workloadId: 'assistant',
  operation: 'tool_conversation',
  connector: 'openrouter',
  requestedModel: 'm',
  maxOutputTokens: 512,
  timeoutMs: 30_000,
} as never;

function textCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return { id: 'c1', required: true, prompt: 'hello', assertions: [], ...overrides };
}

describe('text generation driver', () => {
  it('returns the model text', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'hi there' }], stopReason: 'end_turn', model: 'm' }],
    });
    const observed = await DRIVERS.text_generation(connector, PLAN, textCase());
    expect(observed.text).toBe('hi there');
  });

  it('captures stream chunks when a case asserts streaming', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'abc' }], stopReason: 'end_turn', model: 'm' }],
    });
    const observed = await DRIVERS.text_generation(
      connector,
      PLAN,
      textCase({ assertions: [streamsProgressively()] }),
    );
    expect((observed.chunks ?? []).filter(c => c.type === 'text_delta').length).toBeGreaterThan(1);
  });

  // Streaming is a second model call. Cases that do not assert on it must not
  // pay for it.
  it('makes only one model call when no case asserts streaming', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'abc' }], stopReason: 'end_turn', model: 'm' }],
    });
    await DRIVERS.text_generation(connector, PLAN, textCase());
    expect(connector.calls).toHaveLength(1);
  });
});

describe('structured generation driver', () => {
  it('parses JSON and carries the source text through for grounding', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: '{"ein":"12-3456789"}' }], stopReason: 'end_turn', model: 'm' }],
    });
    const observed = await DRIVERS.structured_generation(
      connector,
      PLAN,
      textCase({ sourceText: 'EIN 12-3456789', responseSchema: { type: 'object' } }),
    );
    expect(observed.json).toEqual({ ein: '12-3456789' });
    expect(observed.sourceText).toBe('EIN 12-3456789');
  });

  it('reports unparseable JSON as a case observation, not a crash', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'not json' }], stopReason: 'end_turn', model: 'm' }],
    });
    const observed = await DRIVERS.structured_generation(connector, PLAN, textCase({ responseSchema: {} }));
    expect(observed.json).toBeUndefined();
    expect(observed.text).toBe('not json');
  });
});

describe('tool conversation driver', () => {
  it('feeds a tool result back for a second turn when the case supplies one', async () => {
    const connector = new FakeConnector({
      responses: [
        { content: [{ type: 'tool_use', id: 't1', name: 'get_x', input: {} }], stopReason: 'tool_use', model: 'm' },
        { content: [{ type: 'text', text: 'x is 5' }], stopReason: 'end_turn', model: 'm' },
      ],
    });
    const observed = await DRIVERS.tool_conversation(
      connector,
      PLAN,
      textCase({
        tools: [{ name: 'get_x', description: 'd', input_schema: { type: 'object', properties: {} } }],
        toolResult: { name: 'get_x', content: '5' },
      }),
    );
    expect(connector.calls).toHaveLength(2);
    expect(observed.text).toBe('x is 5');
  });

  // The assistant workload is tool_conversation but still has to stream, so
  // this driver must be able to observe chunks too.
  it('streams when the case asserts streaming', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'text', text: 'abc' }], stopReason: 'end_turn', model: 'm' }],
    });
    const observed = await DRIVERS.tool_conversation(
      connector,
      PLAN,
      textCase({
        tools: [{ name: 'get_x', description: 'd', input_schema: { type: 'object', properties: {} } }],
        assertions: [streamsProgressively()],
      }),
    );
    expect((observed.chunks ?? []).filter(c => c.type === 'text_delta').length).toBeGreaterThan(1);
    expect(observed.text).toBe('abc');
  });

  it('stops after one turn when the case supplies no tool result', async () => {
    const connector = new FakeConnector({
      responses: [{ content: [{ type: 'tool_use', id: 't1', name: 'get_x', input: {} }], stopReason: 'tool_use', model: 'm' }],
    });
    await DRIVERS.tool_conversation(
      connector,
      PLAN,
      textCase({ tools: [{ name: 'get_x', description: 'd', input_schema: { type: 'object', properties: {} } }] }),
    );
    expect(connector.calls).toHaveLength(1);
  });
});

describe('transport failures', () => {
  it('rethrows a provider error as EvalTransportError, never as a case failure', async () => {
    const connector = new FakeConnector({
      responses: [],
      failWith: new AIExecutionError('rate_limited', 'AI provider rate limit exceeded'),
    });
    await expect(DRIVERS.text_generation(connector, PLAN, textCase()))
      .rejects.toBeInstanceOf(EvalTransportError);
  });
});
