/** Request against the local test origin; paths may also be absolute URLs. */
export function makeRequest(path: string, init?: RequestInit): Request {
  const url = path.startsWith('http') ? path : `http://localhost${path}`;
  return new Request(url, init);
}

/** JSON-body request with the content type expected by route handlers. */
export function makeJsonRequest(path: string, body: unknown, method = 'POST'): Request {
  return makeRequest(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Next.js 15 route-handler context, where params arrive as a Promise. */
export function makeRouteCtx<P extends Record<string, string>>(params: P): { params: Promise<P> } {
  return { params: Promise.resolve(params) };
}

/** Unpack a route response for concise assertions. */
export async function readJson<T = unknown>(res: Response): Promise<{ status: number; body: T }> {
  return { status: res.status, body: await res.json() as T };
}
