// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { uploadDocuments } from '@/lib/org-import/documents';

function fakeStorage(failOn?: string) {
  const upload = vi.fn(async (path: string) =>
    path === failOn ? { error: { message: 'denied' } } : { error: null });
  const from = vi.fn(() => ({ upload }));
  return { db: { storage: { from } } as never, upload, from };
}

describe('uploadDocuments', () => {
  it('uploads each document to its own bucket and path', async () => {
    const { db, upload, from } = fakeStorage();
    const result = await uploadDocuments(db, [
      { bucket: 'tax-documents', path: 'org-1/receipt.pdf', body: Buffer.from('pdf') },
    ]);
    expect(result.uploaded).toBe(1);
    expect(from).toHaveBeenCalledWith('tax-documents');
    expect(upload).toHaveBeenCalledWith('org-1/receipt.pdf', expect.anything(), expect.anything());
  });

  // Object storage has no rollback, so a failed upload must be reported rather
  // than thrown - the rows are already committed and are worth keeping.
  it('reports a failed upload instead of throwing', async () => {
    const { db } = fakeStorage('org-1/bad.pdf');
    const result = await uploadDocuments(db, [
      { bucket: 'tax-documents', path: 'org-1/ok.pdf', body: Buffer.from('a') },
      { bucket: 'tax-documents', path: 'org-1/bad.pdf', body: Buffer.from('b') },
    ]);
    expect(result.uploaded).toBe(1);
    expect(result.failed).toEqual([{ path: 'org-1/bad.pdf', reason: 'denied' }]);
  });

  it('reports nothing for an archive with no documents', async () => {
    const { db } = fakeStorage();
    expect(await uploadDocuments(db, [])).toEqual({ uploaded: 0, failed: [] });
  });
});
