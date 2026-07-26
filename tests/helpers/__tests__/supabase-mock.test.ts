import { describe, it, expect } from 'vitest';
import { stubQuery, stubSupabase } from '../supabase-mock';

describe('stubQuery', () => {
  it('chains builder methods and resolves the configured result on await', async () => {
    const q = stubQuery({ data: [{ id: 1 }], error: null });
    const result = await q.select('*').eq('org_id', 'o1').order('created_at');
    expect(result).toEqual({ data: [{ id: 1 }], error: null });
  });

  it('resolves .single() to its override and otherwise uses the list result', async () => {
    const q = stubQuery({ data: [1, 2], error: null }, { single: { data: { id: 'x' }, error: null } });
    expect(await q.select('*').single()).toEqual({ data: { id: 'x' }, error: null });
    expect(await q.select('*')).toEqual({ data: [1, 2], error: null });
  });

  it('records chained calls with their arguments', async () => {
    const q = stubQuery({ data: null, error: null });
    await q.insert({ a: 1 }).select();
    expect(q.calls).toEqual([
      { method: 'insert', args: [{ a: 1 }] },
      { method: 'select', args: [] },
    ]);
  });
});

describe('stubSupabase', () => {
  it('dispatches .from(table) to a fresh factory result per call', async () => {
    let built = 0;
    const client = stubSupabase({
      tables: { holdings: () => { built += 1; return stubQuery({ data: ['h'], error: null }); } },
    });
    await client.from('holdings').select('*');
    await client.from('holdings').select('*');
    expect(built).toBe(2);
  });

  it('uses fallbackTable when one is provided', async () => {
    const client = stubSupabase({ fallbackTable: () => stubQuery({ data: 'fallback', error: null }) });
    expect(await client.from('anything').select()).toEqual({ data: 'fallback', error: null });
  });

  it('throws for an unstubbed table', () => {
    expect(() => stubSupabase({ tables: {} }).from('nope')).toThrow('no stub for table "nope"');
  });

  it('dispatches RPC handlers and rejects unstubbed functions', async () => {
    const client = stubSupabase({
      rpc: { can_view_org: (args) => ({ data: args?.p_org_id === 'o1', error: null }) },
    });
    expect(await client.rpc('can_view_org', { p_org_id: 'o1' })).toEqual({ data: true, error: null });
    await expect(client.rpc('mystery_fn')).rejects.toThrow('no stub for rpc "mystery_fn"');
  });
});
