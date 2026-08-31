// lib/export/storage.ts
// Enumerates and reads an organization's documents for export.
//
// Objects are read one at a time and written straight into the tar, so peak
// memory is one document rather than a bucket.

import type { ElevatedClient } from '@/lib/api/admin-client';

export const EXPORT_BUCKETS: readonly { bucket: string; included: boolean; reason?: string }[] = [
  { bucket: 'tax-documents', included: true },
  { bucket: 'compliance-documents', included: true },
  { bucket: 'grant-documents', included: true },
  { bucket: 'holding-contact-photos', included: true },
  { bucket: 'builder-artifacts', included: true },
  {
    bucket: 'imports',
    included: false,
    reason: 'raw source files, already normalised into platform tables',
  },
  {
    bucket: 'org-exports',
    included: false,
    reason: 'archives of previous exports; including them would nest exports',
  },
];

const PAGE = 100;

export async function* streamBucketObjects(
  db: ElevatedClient,
  bucket: string,
  orgId: string,
): AsyncGenerator<{ path: string; body: Buffer }> {
  const store = db.storage.from(bucket);
  let offset = 0;

  for (;;) {
    // Listing is scoped to the organization's prefix. That prefix is the only
    // thing separating one tenant's documents from another's in a shared
    // bucket, so it is never omitted or widened.
    const { data, error } = await store.list(orgId, { limit: PAGE, offset });
    if (error) throw error;

    const entries = data ?? [];
    if (entries.length === 0) return;

    for (const entry of entries) {
      const path = `${orgId}/${entry.name}`;
      const file = await store.download(path);
      if (file.error) throw file.error;
      if (!file.data) continue;
      yield { path, body: Buffer.from(await file.data.arrayBuffer()) };
    }

    if (entries.length < PAGE) return;
    offset += entries.length;
  }
}
