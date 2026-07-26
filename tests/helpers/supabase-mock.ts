import { vi, type Mock } from 'vitest';

export type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

const CHAIN_METHODS = [
  'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte',
  'like', 'ilike', 'contains', 'not', 'or', 'filter', 'match',
  'order', 'range', 'limit',
] as const;

type ChainMethod = (typeof CHAIN_METHODS)[number];
type QueryMethod = Mock<(..._args: unknown[]) => QueryStub>;
type ResultMethod = Mock<() => Promise<SupabaseResult>>;

export type QueryStub = Record<ChainMethod, QueryMethod> & {
  calls: Array<{ method: string; args: unknown[] }>;
  single: ResultMethod;
  maybeSingle: ResultMethod;
  then: (
    _onFulfilled: (_result: SupabaseResult) => unknown,
    _onRejected?: (_error: unknown) => unknown
  ) => Promise<unknown>;
};

/** A thenable, chainable Supabase query-builder stub with recorded calls. */
export function stubQuery<T = unknown>(
  result: SupabaseResult<T>,
  overrides: { single?: SupabaseResult; maybeSingle?: SupabaseResult } = {}
): QueryStub {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const stub = {
    calls,
    single: vi.fn(async () => overrides.single ?? result),
    maybeSingle: vi.fn(async () => overrides.maybeSingle ?? result),
    then: (
      _onFulfilled: (_resolved: SupabaseResult) => unknown,
      _onRejected?: (_error: unknown) => unknown
    ) => Promise.resolve(result as SupabaseResult).then(_onFulfilled, _onRejected),
  } as QueryStub;

  for (const method of CHAIN_METHODS) {
    stub[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return stub;
    });
  }

  return stub;
}

/**
 * Build a strict Supabase client stub. Table factories run for each .from()
 * call, keeping state isolated; unstubbed tables and RPCs fail loudly.
 */
export function stubSupabase(config: {
  tables?: Record<string, () => QueryStub>;
  rpc?: Record<string, (_args?: Record<string, unknown>) => SupabaseResult>;
  fallbackTable?: () => QueryStub;
  fallbackRpc?: (_name: string, _args?: Record<string, unknown>) => SupabaseResult;
}): {
  from: Mock<(_table: string) => QueryStub>;
  rpc: Mock<(_fn: string, _args?: Record<string, unknown>) => Promise<SupabaseResult>>;
} {
  const from = vi.fn((table: string): QueryStub => {
    const factory = config.tables?.[table] ?? config.fallbackTable;
    if (!factory) {
      throw new Error(`stubSupabase: no stub for table "${table}"`);
    }
    return factory();
  });

  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>): Promise<SupabaseResult> => {
    const handler = config.rpc?.[fn];
    if (handler) return handler(args);
    if (config.fallbackRpc) return config.fallbackRpc(fn, args);
    throw new Error(`stubSupabase: no stub for rpc "${fn}"`);
  });

  return { from, rpc };
}
