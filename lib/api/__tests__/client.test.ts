// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  apiRequest,
  requestDownload,
  requestJson,
  requestStream,
  uploadJson,
} from '@/lib/api/client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubResponse(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('requestJson', () => {
  it('parses successful JSON and supplies an Accept header', async () => {
    const fetchMock = stubResponse(Response.json({ data: { id: 'one' } }));

    await expect(requestJson<{ data: { id: string } }>('/api/example')).resolves.toEqual({ data: { id: 'one' } });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.has('x-org-id')).toBe(false);
  });

  it('preserves caller headers without inventing tenant authority', async () => {
    const fetchMock = stubResponse(Response.json({ ok: true }));
    await requestJson('/api/example', { headers: { 'x-request-id': 'request-1' } });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('x-request-id')).toBe('request-1');
    expect(headers.has('x-org-id')).toBe(false);
  });

  it('supports an empty successful response', async () => {
    stubResponse(new Response(null, { status: 204 }));
    await expect(requestJson<void>('/api/example', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('normalizes JSON API errors without losing payload details', async () => {
    stubResponse(Response.json(
      { error: 'Invalid request', code: 'bad_input', details: { field: 'name' } },
      { status: 422 }
    ));

    const error = await requestJson('/api/example').catch(value => value);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      message: 'Invalid request',
      status: 422,
      code: 'bad_input',
      details: { field: 'name' },
    });
  });

  it('uses a text error body and rejects malformed success JSON', async () => {
    stubResponse(new Response('upstream unavailable', { status: 503 }));
    await expect(requestJson('/api/example')).rejects.toMatchObject({
      message: 'upstream unavailable',
      status: 503,
    });

    stubResponse(new Response('<html>not json</html>', { status: 200 }));
    await expect(requestJson('/api/example')).rejects.toMatchObject({
      code: 'invalid_json_response',
      status: 200,
    });
  });
});

describe('named transports', () => {
  it('uploads FormData without forcing a multipart Content-Type', async () => {
    const fetchMock = stubResponse(Response.json({ stored: true }));
    const form = new FormData();
    form.set('file', new Blob(['content']), 'report.txt');

    await expect(uploadJson<{ stored: boolean }>('/api/upload', form, { method: 'POST' }))
      .resolves.toEqual({ stored: true });
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBe(form);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it('returns checked downloads and sanitizes a response filename', async () => {
    stubResponse(new Response('report', {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="../board-report.pdf"' },
    }));

    const result = await requestDownload('/api/report');
    expect(await result.blob.text()).toBe('report');
    expect(result.filename).toBe('.._board-report.pdf');
  });

  it('preserves a successful stream body and rejects a missing one', async () => {
    stubResponse(new Response('event: message\n\ndata: ok\n\n', { status: 200 }));
    const response = await requestStream('/api/stream');
    expect(await response.text()).toContain('data: ok');

    stubResponse(new Response(null, { status: 200 }));
    await expect(requestStream('/api/stream')).rejects.toMatchObject({ code: 'missing_response_stream' });
  });

  it('passes AbortSignal through the low-level response primitive', async () => {
    const fetchMock = stubResponse(Response.json({ ok: true }));
    const controller = new AbortController();
    await apiRequest('/api/example', { signal: controller.signal });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
