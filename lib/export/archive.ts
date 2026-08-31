// lib/export/archive.ts
// Streams an organization's rows into a tar of gzipped NDJSON, hashing each
// file as it is written.
//
// Rows are pulled a page at a time and pushed through gzip incrementally, so
// memory tracks a table's compressed size rather than its row count. tar-stream
// needs an entry size up front, which is why the compressed bytes are held while
// the entry is written; if a single table's compressed size ever becomes the
// constraint, the fix is a two-pass write to a temporary object, not buffering
// rows.

import { createHash } from 'node:crypto';
import { PassThrough, Writable, pipeline } from 'node:stream';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';
import { pack } from 'tar-stream';
import type { ElevatedClient } from '@/lib/api/admin-client';
import { EXPORT_TABLES, exportableTables } from '@/lib/export/tables';
import { streamTableRows } from '@/lib/export/rows';

const pipe = promisify(pipeline);

export const EXPORT_FORMAT_VERSION = 1;

export type ExportManifest = {
  orgId: string;
  orgName: string;
  exportedAt: string;
  formatVersion: number;
  /** 'string' means numeric columns are JSON strings; parse them as decimals. */
  numericEncoding: 'string';
  schema: { ledger: { version: string; state: string }[]; driftCheckAvailable: boolean };
  files: { path: string; sha256: string; rows?: number; bytes: number }[];
  excluded: { table?: string; bucket?: string; reason: string }[];
};

export type ArchiveResult = {
  manifest: ExportManifest;
  manifestHash: string;
  rowCount: number;
  byteCount: number;
};

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function writeArchive(input: {
  db: ElevatedClient;
  orgId: string;
  orgName: string;
  sink: NodeJS.WritableStream;
}): Promise<ArchiveResult> {
  const { db, orgId, orgName, sink } = input;
  const tar = pack();
  const written = tar.pipe(sink);

  const files: ExportManifest['files'] = [];
  let rowCount = 0;
  let byteCount = 0;

  for (const rule of exportableTables()) {
    const path = `tables/${rule.table}.ndjson.gz`;
    const source = new PassThrough();
    const gzip = createGzip();
    const hash = createHash('sha256');
    const chunks: Buffer[] = [];

    let rows = 0;
    let bytes = 0;

    // Collected in a Writable rather than a 'data' listener: pipeline resolves
    // when the final destination finishes, so every compressed byte is
    // accounted for before the entry is written. A listener races the last
    // chunk and produces a truncated file.
    const collector = new Writable({
      write(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        chunks.push(Buffer.from(chunk));
        bytes += chunk.length;
        cb();
      },
    });

    const feed = (async () => {
      for await (const line of streamTableRows(db, rule, orgId)) {
        rows += 1;
        if (!source.write(`${line}\n`)) {
          await new Promise(resolve => source.once('drain', resolve));
        }
      }
      source.end();
    })();

    await Promise.all([feed, pipe(source, gzip, collector)]);

    if (rows === 0) continue;

    const body = Buffer.concat(chunks);
    await new Promise<void>((resolve, reject) => {
      tar.entry({ name: path, size: body.length }, body, err => (err ? reject(err) : resolve()));
    });

    files.push({ path, sha256: hash.digest('hex'), rows, bytes });
    rowCount += rows;
    byteCount += bytes;
  }

  const excluded: ExportManifest['excluded'] = EXPORT_TABLES
    .filter(rule => rule.kind === 'reference' || rule.kind === 'platform')
    .map(rule => ({ table: rule.table, reason: (rule as { reason: string }).reason }));

  const ledger = await db.from('applied_migrations').select('version, checksum').order('version');
  const manifest: ExportManifest = {
    orgId,
    orgName,
    exportedAt: new Date().toISOString(),
    formatVersion: EXPORT_FORMAT_VERSION,
    numericEncoding: 'string',
    schema: {
      ledger: (ledger.data ?? []).map((row: { version: string; checksum: string }) => ({
        version: row.version,
        state: row.checksum === 'unverified' ? 'adopted' : 'verified',
      })),
      // The worker has no migration files on disk to compare against, so this
      // is not a claim that there is no drift - only that nothing checked.
      driftCheckAvailable: false,
    },
    files,
    excluded,
  };

  const manifestText = JSON.stringify(manifest, null, 2);
  await new Promise<void>((resolve, reject) => {
    tar.entry({ name: 'manifest.json', size: Buffer.byteLength(manifestText) }, manifestText,
      err => (err ? reject(err) : resolve()));
  });

  tar.finalize();
  await new Promise<void>((resolve, reject) => {
    written.on('finish', () => resolve());
    written.on('error', reject);
  });

  return { manifest, manifestHash: sha256Hex(manifestText), rowCount, byteCount };
}
