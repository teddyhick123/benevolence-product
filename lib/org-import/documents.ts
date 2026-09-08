// lib/org-import/documents.ts
// Uploads an archive's documents after the row transaction commits.
//
// Object storage has no rollback. Uploading before the commit would leave
// orphaned files behind a failed import that nobody would ever enumerate.

import type { ElevatedClient } from '@/lib/api/admin-client';
import type { ArchiveContents } from '@/lib/org-import/reader';

export async function uploadDocuments(
  db: ElevatedClient,
  documents: ArchiveContents['documents'],
): Promise<{ uploaded: number; failed: { path: string; reason: string }[] }> {
  let uploaded = 0;
  const failed: { path: string; reason: string }[] = [];

  for (const doc of documents) {
    const { error } = await db.storage.from(doc.bucket).upload(doc.path, doc.body, {
      upsert: true,
    });
    if (error) {
      // Reported, not thrown: the rows are committed and worth keeping, and a
      // named missing document is recoverable.
      failed.push({ path: doc.path, reason: error.message });
      continue;
    }
    uploaded += 1;
  }

  return { uploaded, failed };
}
