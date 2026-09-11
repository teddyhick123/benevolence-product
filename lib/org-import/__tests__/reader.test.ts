// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pack } from 'tar-stream';
import { describe, expect, it } from 'vitest';
import { readArchive } from '@/lib/org-import/reader';

/** Builds a minimal archive on disk and returns its path. */
async function buildArchive(options: { corruptHash?: boolean; omitFile?: boolean } = {}): Promise<string> {
  const body = gzipSync('{"id":"a","amount":"25000.00"}\n');
  const digest = createHash('sha256').update(body).digest('hex');

  const manifest = {
    orgId: 'org-1', orgName: 'Test Org', exportedAt: '2026-09-07T00:00:00.000Z',
    formatVersion: 1, numericEncoding: 'string',
    schema: { ledger: [{ version: '0061', state: 'verified' }], driftCheckAvailable: false },
    files: [{
      path: 'tables/holdings.ndjson.gz',
      sha256: options.corruptHash ? 'f'.repeat(64) : digest,
      rows: 1, bytes: body.length,
    }],
    documents: [], excluded: [],
  };
  const manifestText = JSON.stringify(manifest);

  const tar = pack();
  const out: Buffer[] = [];
  tar.on('data', (c: unknown) => { out.push(Buffer.from(c as Uint8Array)); });
  const done = new Promise<void>(resolve => tar.on('end', () => resolve()));

  tar.entry({ name: 'manifest.json', size: Buffer.byteLength(manifestText) }, manifestText);
  if (!options.omitFile) {
    tar.entry({ name: 'tables/holdings.ndjson.gz', size: body.length }, body);
  }
  tar.entry({ name: 'storage/tax-documents/org-1/receipt.pdf', size: 3 }, Buffer.from('pdf'));
  tar.finalize();
  await done;

  const dir = mkdtempSync(join(tmpdir(), 'archive-'));
  const path = join(dir, 'test.tar');
  writeFileSync(path, Buffer.concat(out));
  return path;
}

describe('readArchive', () => {
  it('returns the manifest and one row list per table', async () => {
    const contents = await readArchive(await buildArchive());
    expect(contents.manifest.orgId).toBe('org-1');
    expect(contents.tables.get('holdings')).toEqual(['{"id":"a","amount":"25000.00"}']);
  });

  // The numeric stays a string all the way through. Parsing it here would
  // destroy the scale that the export format exists to preserve.
  it('leaves numerics as strings rather than parsing them', async () => {
    const contents = await readArchive(await buildArchive());
    const line = contents.tables.get('holdings')![0];
    expect(line).toContain('"amount":"25000.00"');
    expect(JSON.parse(line).amount).toBe('25000.00');
  });

  it('separates documents by bucket and path', async () => {
    const contents = await readArchive(await buildArchive());
    expect(contents.documents).toEqual([
      { bucket: 'tax-documents', path: 'org-1/receipt.pdf', body: Buffer.from('pdf') },
    ]);
  });

  // An archive that fails its own manifest is not imported at all.
  it('refuses a file whose hash does not match, naming it', async () => {
    await expect(readArchive(await buildArchive({ corruptHash: true })))
      .rejects.toThrow(/holdings\.ndjson\.gz/);
  });

  it('refuses an archive missing a file its manifest lists', async () => {
    await expect(readArchive(await buildArchive({ omitFile: true })))
      .rejects.toThrow(/missing/i);
  });

  it('refuses an archive with no manifest', async () => {
    const tar = pack();
    const out: Buffer[] = [];
    tar.on('data', (c: unknown) => { out.push(Buffer.from(c as Uint8Array)); });
    const done = new Promise<void>(resolve => tar.on('end', () => resolve()));
    tar.entry({ name: 'tables/x.ndjson.gz', size: 3 }, Buffer.from('abc'));
    tar.finalize();
    await done;

    const dir = mkdtempSync(join(tmpdir(), 'archive-'));
    const path = join(dir, 'nomanifest.tar');
    writeFileSync(path, Buffer.concat(out));

    await expect(readArchive(path)).rejects.toThrow(/manifest/i);
  });
});
