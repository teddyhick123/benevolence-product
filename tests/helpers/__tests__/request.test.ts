import { describe, it, expect } from 'vitest';
import { makeRequest, makeJsonRequest, makeRouteCtx, readJson } from '../request';

describe('request helpers', () => {
  it('prefixes bare paths with the local test origin', () => {
    expect(makeRequest('/api/me').url).toBe('http://localhost/api/me');
    expect(makeRequest('http://example.com/x').url).toBe('http://example.com/x');
  });

  it('sends JSON with the expected header and method', async () => {
    const req = makeJsonRequest('/api/org/o1/grants', { name: 'g' });
    expect(req.method).toBe('POST');
    expect(req.headers.get('Content-Type')).toBe('application/json');
    expect(await req.json()).toEqual({ name: 'g' });
  });

  it('wraps route params in a promise', async () => {
    expect(await makeRouteCtx({ orgId: 'o1' }).params).toEqual({ orgId: 'o1' });
  });

  it('unpacks response status and parsed JSON', async () => {
    const res = new Response(JSON.stringify({ ok: true }), { status: 201 });
    expect(await readJson(res)).toEqual({ status: 201, body: { ok: true } });
  });
});
