/**
 * Browser/API transport primitives.
 *
 * This module deliberately carries no tenant authority. Organization and
 * portfolio identifiers remain part of the API URL/body and are authorized by
 * the server guard/repository boundary.
 */

export interface ApiErrorPayload {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
  [key: string]: unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly payload?: unknown;

  constructor(args: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
    payload?: unknown;
    cause?: unknown;
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause });
    this.name = 'ApiClientError';
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
    this.payload = args.payload;
  }
}

export interface ApiDownload {
  blob: Blob;
  filename: string | null;
  response: Response;
}

function withAccept(headers: HeadersInit | undefined, accept: string): Headers {
  const merged = new Headers(headers);
  if (!merged.has('Accept')) merged.set('Accept', accept);
  return merged;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function errorFields(payload: unknown): {
  message?: string;
  code?: string;
  details?: unknown;
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const body = payload as ApiErrorPayload;
  return {
    message: stringField(body.error) ?? stringField(body.message),
    code: stringField(body.code),
    details: body.details,
  };
}

async function readBody(response: Response): Promise<{
  empty: boolean;
  json: boolean;
  value: unknown;
  parseError?: unknown;
}> {
  if (response.status === 204 || response.status === 205) {
    return { empty: true, json: true, value: undefined };
  }

  // Some established component tests and browser polyfills provide a minimal
  // Response-compatible object with json() but no text(). Production fetch
  // responses take the text path below so parsing still happens exactly once.
  if (typeof response.text !== 'function' && typeof response.json === 'function') {
    try {
      const value = await response.json();
      return { empty: value === undefined, json: true, value };
    } catch (parseError) {
      return { empty: false, json: false, value: '', parseError };
    }
  }

  const text = await response.text();
  if (!text.trim()) return { empty: true, json: true, value: undefined };

  try {
    return { empty: false, json: true, value: JSON.parse(text) };
  } catch (parseError) {
    return { empty: false, json: false, value: text, parseError };
  }
}

function responseError(response: Response, body: Awaited<ReturnType<typeof readBody>>): ApiClientError {
  const fields = errorFields(body.value);
  const textMessage = !body.json && typeof body.value === 'string' ? body.value.trim() : undefined;
  return new ApiClientError({
    message: fields.message ?? textMessage ?? `Request failed with status ${response.status}`,
    status: response.status,
    code: fields.code,
    details: fields.details,
    payload: body.value,
  });
}

/** Low-level response-preserving request for streams, files, or status-aware flows. */
export function apiRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return init === undefined ? globalThis.fetch(input) : globalThis.fetch(input, init);
}

/** The canonical JSON parser and error contract for browser API calls. */
export async function requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const response = await apiRequest(input, {
    ...init,
    headers: withAccept(init.headers, 'application/json'),
  });
  const body = await readBody(response);

  if (!response.ok) throw responseError(response, body);
  if (body.empty) return undefined as T;
  if (!body.json) {
    throw new ApiClientError({
      message: 'Expected a JSON response',
      status: response.status,
      code: 'invalid_json_response',
      payload: body.value,
      cause: body.parseError,
    });
  }

  return body.value as T;
}

/**
 * Parse an already-fetched response through the same JSON rules while leaving
 * status handling to response-aware callers that intentionally inspect `ok`.
 */
export async function readJson<T = any>(response: Response): Promise<T> {
  const body = await readBody(response);
  if (body.empty) return undefined as T;
  if (!body.json) {
    throw new ApiClientError({
      message: 'Expected a JSON response',
      status: response.status,
      code: 'invalid_json_response',
      payload: body.value,
      cause: body.parseError,
    });
  }
  return body.value as T;
}

export const swrJsonFetcher = <T>(url: string): Promise<T> => requestJson<T>(url);

export function uploadJson<T>(
  input: RequestInfo | URL,
  body: FormData,
  init: Omit<RequestInit, 'body'> = {}
): Promise<T> {
  return requestJson<T>(input, { ...init, body });
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replace(/[\\/]/g, '_');
    } catch {
      // Fall through to the ordinary filename form.
    }
  }

  const plain = disposition.match(/filename=(?:"([^"]+)"|([^;]+))/i);
  const filename = (plain?.[1] ?? plain?.[2])?.trim();
  return filename ? filename.replace(/[\\/]/g, '_') : null;
}

export async function requestDownload(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<ApiDownload> {
  const response = await apiRequest(input, init);

  if (!response.ok) {
    const body = await readBody(response);
    throw responseError(response, body);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')),
    response,
  };
}

export async function requestStream(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const response = await apiRequest(input, init);
  if (!response.ok) {
    const body = await readBody(response);
    throw responseError(response, body);
  }
  if (!response.body) {
    throw new ApiClientError({
      message: 'Response stream is unavailable',
      status: response.status,
      code: 'missing_response_stream',
    });
  }
  return response;
}
