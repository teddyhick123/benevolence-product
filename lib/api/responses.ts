import { NextResponse } from 'next/server';

export const AUTHENTICATED_JSON_CACHE_CONTROL = 'no-store';

function withDefaultCache(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', AUTHENTICATED_JSON_CACHE_CONTROL);
  }
  return { ...init, headers };
}

/** JSON response for authenticated API data; defaults to no-store. */
export function jsonOk<T>(body: T, init: ResponseInit = {}): NextResponse<T> {
  return NextResponse.json(body, withDefaultCache(init));
}

/** Standard JSON error response; defaults to no-store. */
export function jsonError(
  message: string,
  status: number,
  init: Omit<ResponseInit, 'status'> = {}
): NextResponse<{ error: string }> {
  return NextResponse.json(
    { error: message },
    withDefaultCache({ ...init, status })
  );
}
