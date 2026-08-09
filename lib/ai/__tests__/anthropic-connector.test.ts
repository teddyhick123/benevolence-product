import { describe, expect, it, vi } from 'vitest';
import { AnthropicConnector } from '@/lib/ai/connectors/anthropic';
import { resolveAIExecution } from '@/lib/ai/resolver';

describe('Anthropic connector', () => {
  it('maps the resolved model and neutral request into the legacy provider', async () => {
    const provider = {
      createMessage: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'answer' }],
        stopReason: 'end_turn',
        model: 'resolved-model',
        usage: { inputTokens: 3, outputTokens: 2 },
      }),
      createStream: vi.fn(),
    };
    const connector = new AnthropicConnector(provider);
    const plan = resolveAIExecution({ kind: 'platform', actorId: 'user-1' }, 'summaries');
    const result = await connector.generateText(plan, {
      system: 'system',
      messages: [{ role: 'user', content: 'prompt' }],
      maxOutputTokens: 100,
      temperature: 0.2,
    });

    expect(result.text).toBe('answer');
    expect(provider.createMessage).toHaveBeenCalledWith({
      model: plan.requestedModel,
      system: 'system',
      messages: [{ role: 'user', content: 'prompt' }],
      maxTokens: 100,
      temperature: 0.2,
      signal: undefined,
    });
  });

  it('parses structured output through the caller-owned validator', async () => {
    const provider = {
      createMessage: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"value":42}' }],
        stopReason: 'end_turn',
        model: 'resolved-model',
      }),
      createStream: vi.fn(),
    };
    const connector = new AnthropicConnector(provider);
    const plan = resolveAIExecution({ kind: 'platform', actorId: 'user-1' }, 'extraction');
    const result = await connector.generateStructured(
      plan,
      { messages: [{ role: 'user', content: 'prompt' }] },
      (text) => JSON.parse(text) as { value: number },
    );

    expect(result.value).toEqual({ value: 42 });
  });
});
