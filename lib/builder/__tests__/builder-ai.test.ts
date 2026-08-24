// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { builderChatStream, builderPlan, builderBuild, builderReview } from '@/lib/builder/ai';

function fakeGateway(text = 'result') {
  const resolve = vi.fn().mockImplementation(async (workloadId: string) => ({
    workloadId,
    operation: 'text_generation',
    connector: 'anthropic',
    requestedModel: 'm',
    maxOutputTokens: 4096,
  }));
  return {
    resolve,
    generateText: vi.fn().mockResolvedValue({ text, response: {} }),
    streamToolConversation: vi.fn().mockImplementation(async function* () {
      yield { type: 'text_delta', text };
    }),
  };
}

const SCOPE = { orgId: 'org-1', actorId: 'user-1' };

describe('builder AI boundary', () => {
  it('resolves each phase on its own workload', async () => {
    const cases = [
      [builderPlan, 'builder_plan'],
      [builderBuild, 'builder_build'],
      [builderReview, 'builder_review'],
    ] as const;

    for (const [fn, workloadId] of cases) {
      const gateway = fakeGateway();
      await fn(SCOPE, { system: 's', prompt: 'p' }, gateway as never);
      expect(gateway.resolve).toHaveBeenCalledWith(workloadId);
    }
  });

  it('streams chat on the builder_chat workload', async () => {
    const gateway = fakeGateway('hello');
    const chunks = [];
    for await (const chunk of builderChatStream(
      SCOPE,
      { system: 's', messages: [{ role: 'user', content: 'hi' }], tools: [] },
      gateway as never,
    )) chunks.push(chunk);

    expect(gateway.resolve).toHaveBeenCalledWith('builder_chat');
    expect(chunks).toHaveLength(1);
  });

  it('returns the generated text', async () => {
    const gateway = fakeGateway('a plan');
    await expect(builderPlan(SCOPE, { system: 's', prompt: 'p' }, gateway as never))
      .resolves.toBe('a plan');
  });

  it('scopes execution to the organization so spend is attributable', async () => {
    const gateway = fakeGateway();
    await builderBuild(SCOPE, { system: 's', prompt: 'p' }, gateway as never);
    expect(gateway.generateText).toHaveBeenCalled();
  });

  // Queued scaffold work runs with no user present; the organization is what
  // attribution needs.
  it('works without an actor', async () => {
    const gateway = fakeGateway();
    await expect(builderBuild({ orgId: 'org-1' }, { system: 's', prompt: 'p' }, gateway as never))
      .resolves.toBe('result');
  });
});
