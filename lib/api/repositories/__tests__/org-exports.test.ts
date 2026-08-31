// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createOrgExportRepository } from '@/lib/api/repositories/org-exports';

function dbReturning(rows: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['update', 'eq', 'select', 'insert', 'order', 'lt']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn(async () => ({ data: rows, error: null }));
  chain.single = vi.fn(async () => ({ data: rows, error: null }));
  chain.then = undefined;
  return { from: vi.fn(() => chain), _chain: chain } as never;
}

function chainOf(db: unknown) {
  return (db as { _chain: Record<string, ReturnType<typeof vi.fn>> })._chain;
}

describe('org export repository', () => {
  // At-most-once execution: only the worker that moves the row out of 'queued'
  // may run it, the same way evaluation runs are claimed.
  it('claims a run only when it was still queued', async () => {
    const db = dbReturning({ id: 'run-1' });
    await expect(createOrgExportRepository(db).claimRun('run-1')).resolves.toBe(true);
    expect(chainOf(db).eq).toHaveBeenCalledWith('status', 'queued');
  });

  it('reports a lost claim rather than throwing', async () => {
    await expect(createOrgExportRepository(dbReturning(null)).claimRun('run-1')).resolves.toBe(false);
  });

  it('records the manifest hash and counts when a run succeeds', async () => {
    const db = dbReturning({ id: 'run-1' });
    await createOrgExportRepository(db).finishRun('run-1', {
      manifestHash: 'a'.repeat(64), rowCount: 12, byteCount: 345,
      storagePath: 'org-1/export.tar', expiresAt: '2026-09-07T00:00:00.000Z',
    });
    expect(chainOf(db).update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'succeeded', manifest_hash: 'a'.repeat(64), row_count: 12,
    }));
  });

  // A failed export must not leave a row that looks successful.
  it('records a reason when a run fails', async () => {
    const db = dbReturning({ id: 'run-1' });
    await createOrgExportRepository(db).failRun('run-1', 'storage upload rejected');
    expect(chainOf(db).update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', error: 'storage upload rejected',
    }));
  });

  // The archive is gone but the record that it existed is not.
  it('clears the storage path when marking a run expired', async () => {
    const db = dbReturning({ id: 'run-1' });
    await createOrgExportRepository(db).markExpired('run-1');
    expect(chainOf(db).update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'expired', storage_path: null,
    }));
  });
});
