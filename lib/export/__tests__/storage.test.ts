// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { EXPORT_BUCKETS, streamBucketObjects } from '@/lib/export/storage';

describe('export buckets', () => {
  it('names every bucket in the database', () => {
    expect(EXPORT_BUCKETS.map(b => b.bucket).sort()).toEqual([
      'builder-artifacts', 'compliance-documents', 'grant-documents',
      'holding-contact-photos', 'imports', 'org-exports', 'tax-documents',
    ]);
  });

  // Raw uploads are already normalised into platform tables, so including them
  // roughly doubles archive size to re-ship data the export already carries.
  it('excludes imports and org-exports, with a stated reason', () => {
    for (const name of ['imports', 'org-exports']) {
      const entry = EXPORT_BUCKETS.find(b => b.bucket === name);
      expect(entry?.included).toBe(false);
      expect(entry?.reason).toBeTruthy();
    }
  });

  it('includes the five buckets holding organization documents', () => {
    const included = EXPORT_BUCKETS.filter(b => b.included).map(b => b.bucket).sort();
    expect(included).toEqual([
      'builder-artifacts', 'compliance-documents', 'grant-documents',
      'holding-contact-photos', 'tax-documents',
    ]);
  });
});

describe('streamBucketObjects', () => {
  function fakeStorage(listing: { name: string }[]) {
    const list = vi.fn(async (_prefix: string, opts: { offset: number }) =>
      ({ data: opts.offset === 0 ? listing : [], error: null }));
    const download = vi.fn(async () => ({
      data: { arrayBuffer: async () => new TextEncoder().encode('file body').buffer },
      error: null,
    }));
    const from = vi.fn(() => ({ list, download }));
    return { db: { storage: { from } } as never, list, from };
  }

  it('yields each object under the organization prefix', async () => {
    const { db } = fakeStorage([{ name: 'receipt.pdf' }]);
    const seen: string[] = [];
    for await (const obj of streamBucketObjects(db, 'tax-documents', 'org-1')) {
      seen.push(obj.path);
      expect(obj.body.toString()).toBe('file body');
    }
    expect(seen).toEqual(['org-1/receipt.pdf']);
  });

  // A document another organization owns must never reach this archive.
  it('lists only within the organization prefix', async () => {
    const { db, list } = fakeStorage([]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _obj of streamBucketObjects(db, 'tax-documents', 'org-1')) {
      // no objects expected
    }
    expect(list).toHaveBeenCalledWith('org-1', expect.anything());
  });

  it('stops when a page is short rather than looping forever', async () => {
    const { db, list } = fakeStorage([{ name: 'a.pdf' }]);
    const seen: string[] = [];
    for await (const obj of streamBucketObjects(db, 'tax-documents', 'org-1')) {
      seen.push(obj.path);
    }
    expect(seen).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
