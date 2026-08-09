// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { OpenRouterConnector } from '@/lib/ai/connectors/openrouter';
import { resolveAIExecution } from '@/lib/ai/resolver';

const plan = {
  ...resolveAIExecution({ kind: 'organization', orgId: 'org-1' }, 'assistant'),
  connector: 'openrouter' as const,
  requestedModel: 'anthropic/claude-sonnet-4.5',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenRouter connector', () => {
  it('maps neutral tool conversations and disables provider-owned fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: 'generation-1',
      model: 'anthropic/claude-sonnet-4.5',
      provider: 'Amazon Bedrock',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [{
            id: 'tool-1',
            function: { name: 'get_summary', arguments: '{"year":2026}' },
          }],
        },
      }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 4 },
      },
    }));
    const connector = new OpenRouterConnector({
      apiKey: 'sk-or-valid-test-key',
      provider: { order: ['Amazon Bedrock'], zdr: true },
      fetch: fetcher,
    });
    const response = await connector.runToolConversation(plan, {
      system: 'System instruction',
      messages: [{ role: 'user', content: 'Summarize this portfolio' }],
      tools: [{
        name: 'get_summary',
        description: 'Get a summary',
        input_schema: { type: 'object', properties: { year: { type: 'number' } } },
      }],
    });

    expect(response).toMatchObject({
      stopReason: 'tool_use',
      providerRequestId: 'generation-1',
      resolvedProvider: 'Amazon Bedrock',
      usage: { inputTokens: 20, outputTokens: 5, cachedInputTokens: 4 },
      content: [{ type: 'tool_use', id: 'tool-1', name: 'get_summary', input: { year: 2026 } }],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer sk-or-valid-test-key');
    const request = JSON.parse(init.body);
    expect(request.provider).toEqual({
      order: ['Amazon Bedrock'],
      zdr: true,
      allow_fallbacks: false,
    });
    expect(request.tools[0]).toMatchObject({ type: 'function', function: { name: 'get_summary' } });
  });

  it('sends strict JSON Schema when a structured response format is supplied', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: 'generation-2',
      model: 'openai/gpt-4o',
      choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }],
    }));
    const connector = new OpenRouterConnector({ apiKey: 'sk-or-valid-test-key', fetch: fetcher });
    const structuredPlan = { ...plan, operation: 'structured_generation' as const };
    const result = await connector.generateStructured(
      structuredPlan,
      {
        messages: [{ role: 'user', content: 'Return JSON' }],
        responseFormat: {
          name: 'result',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },
      JSON.parse,
    );
    expect(result.value).toEqual({ ok: true });
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'result', strict: true },
    });
  });

  it.each([
    [401, 'credential_invalid'],
    [402, 'credit_exhausted'],
    [429, 'rate_limited'],
    [503, 'deployment_unavailable'],
  ])('normalizes HTTP %i without exposing provider payloads', async (status, code) => {
    const connector = new OpenRouterConnector({
      apiKey: 'sk-or-valid-test-key',
      fetch: vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'native secret' } }, status)),
    });
    await expect(connector.generateText(plan, {
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({ code });
  });

  it('assembles SSE text, tool calls, resolved provider, and terminal usage', async () => {
    const events = [
      ': OPENROUTER PROCESSING\n',
      'data: {"id":"generation-3","model":"anthropic/claude-sonnet-4.5","provider":"Google","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"generation-3","model":"anthropic/claude-sonnet-4.5","choices":[{"delta":{"tool_calls":[{"index":0,"id":"tool-1","function":{"name":"lookup","arguments":"{\\"id\\":"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"generation-3","model":"anthropic/claude-sonnet-4.5","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: {"id":"generation-3","model":"anthropic/claude-sonnet-4.5","choices":[],"usage":{"prompt_tokens":8,"completion_tokens":3}}\n\n',
      'data: [DONE]\n\n',
    ];
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    });
    const connector = new OpenRouterConnector({
      apiKey: 'sk-or-valid-test-key',
      fetch: vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    });
    const chunks = [];
    for await (const chunk of connector.streamToolConversation(plan, {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })) chunks.push(chunk);

    expect(chunks).toContainEqual({ type: 'text_delta', text: 'Hello' });
    expect(chunks).toContainEqual({
      type: 'content_block_start',
      blockType: 'tool_use',
      id: 'tool-1',
      name: 'lookup',
    });
    expect(chunks.at(-1)).toMatchObject({
      type: 'message_stop',
      stopReason: 'tool_use',
      providerRequestId: 'generation-3',
      resolvedProvider: 'Google',
      usage: { inputTokens: 8, outputTokens: 3 },
    });
  });
});
