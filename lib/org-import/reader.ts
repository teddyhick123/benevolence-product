// lib/org-import/reader.ts
// Reads an export archive and verifies it against its own manifest.
//
// Verification completes before the caller writes anything: an archive that
// fails its own hashes is not imported at all.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { extract } from 'tar-stream';
import type { ExportManifest } from '@/lib/export/archive';

export type ArchiveContents = {
  manifest: ExportManifest;
  /** table name -> NDJSON lines, numerics still strings. */
  tables: Map<string, string[]>;
  documents: { bucket: string; path: string; body: Buffer }[];
};

export async function readArchive(path: string): Promise<ArchiveContents> {
  const entries = new Map<string, Buffer>();
  const ex = extract();

  await new Promise<void>((resolve, reject) => {
    ex.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: unknown) => { chunks.push(Buffer.from(c as Uint8Array)); });
      stream.on('end', () => { entries.set(header.name, Buffer.concat(chunks)); next(); });
      stream.on('error', reject);
    });
    ex.on('finish', () => resolve());
    ex.on('error', reject);
    createReadStream(path).pipe(ex);
  });

  const manifestRaw = entries.get('manifest.json');
  if (!manifestRaw) {
    throw new Error(`Archive has no manifest.json: ${path}`);
  }
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as ExportManifest;

  // Every hash, before any caller writes a row.
  for (const file of manifest.files) {
    const body = entries.get(file.path);
    if (!body) {
      throw new Error(`Archive is missing a file its manifest lists: ${file.path}`);
    }
    const actual = createHash('sha256').update(body).digest('hex');
    if (actual !== file.sha256) {
      throw new Error(
        `Archive file ${file.path} does not match its manifest hash ` +
        `(recorded ${file.sha256.slice(0, 8)}…, actual ${actual.slice(0, 8)}…). ` +
        'The archive is damaged; nothing has been imported.',
      );
    }
  }

  const tables = new Map<string, string[]>();
  const documents: ArchiveContents['documents'] = [];

  for (const [name, body] of entries) {
    if (name.startsWith('tables/') && name.endsWith('.ndjson.gz')) {
      const table = name.slice('tables/'.length, -'.ndjson.gz'.length);
      const text = gunzipSync(body).toString('utf8');
      // Lines stay strings. The moment a numeric passes through JSON.parse as
      // a number its scale is gone, which is what the string encoding exists
      // to prevent.
      tables.set(table, text.split('\n').filter(line => line.length > 0));
      continue;
    }
    if (name.startsWith('storage/')) {
      const rest = name.slice('storage/'.length);
      const slash = rest.indexOf('/');
      if (slash === -1) continue;
      documents.push({
        bucket: rest.slice(0, slash),
        path: rest.slice(slash + 1),
        body,
      });
    }
  }

  return { manifest, tables, documents };
}
