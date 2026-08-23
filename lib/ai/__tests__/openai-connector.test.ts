// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { OpenAIConnector } from '@/lib/ai/connectors/openai';

const API_KEY = 'sk-test-0123456789abcdef';

const PLAN = {
  connector: 'openai' as const,
  requestedModel: 'gpt-5.6-sol',
  maxOutputTokens: 1024,
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OpenAIConnector', () => {
  it('posts to the OpenAI chat-completions endpoint with the supplied key', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }));

    const connector = new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher });
    const result = await connector.generateText(PLAN as never, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.text).toBe('hello');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.authorization).toBe(`Bearer ${API_KEY}`);
  });

  it('sends no OpenRouter provider routing block', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ finish_reason: 'stop', message: { content: 'ok' } }],
    }));

    await new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher })
      .generateText(PLAN as never, { messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.provider).toBeUndefined();
    expect(body.model).toBe('gpt-5.6-sol');
  });

  it('maps an auth failure to credential_invalid', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(
      new OpenAIConnector({ apiKey: API_KEY, fetch: fetcher })
        .generateText(PLAN as never, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'credential_invalid' });
  });

  it('rejects a malformed key at construction', () => {
    expect(() => new OpenAIConnector({ apiKey: 'short' })).toThrow();
  });
});
