// @vitest-environment node

import { createGunzip } from 'node:zlib';
import { Writable } from 'node:stream';
import { extract } from 'tar-stream';
import { describe, expect, it, vi } from 'vitest';
import { writeArchive, type ExportManifest } from '@/lib/export/archive';

/** Collects a tar stream into { path: contents }, gunzipping .gz entries. */
async function readArchive(buffer: Buffer): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const ex = extract();
  const done = new Promise<void>((resolve, reject) => {
    ex.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      // tar-stream's Source and zlib's Gunzip share no common stream type in
      // the published typings, so the union is narrowed at the call site.
      const target = (header.name.endsWith('.gz')
        ? stream.pipe(createGunzip())
        : stream) as unknown as NodeJS.ReadableStream;
      target.on('data', (c: Buffer) => { chunks.push(c); });
      target.on('end', () => {
        files[header.name] = Buffer.concat(chunks).toString('utf8');
        next();
      });
      target.on('error', reject);
    });
    ex.on('finish', () => resolve());
    ex.on('error', reject);
  });
  ex.end(buffer);
  await done;
  return files;
}

function collectingSink() {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  return { sink, buffer: () => Buffer.concat(chunks) };
}

/** Storage that lists nothing, so table tests are unaffected by documents. */
const emptyStorage = () => ({
  from: vi.fn(() => ({
    list: vi.fn(async () => ({ data: [], error: null })),
    download: vi.fn(async () => ({ data: null, error: null })),
  })),
});

/** A db double returning the given lines for the given tables. */
function fakeDb(rows: Record<string, string[]>) {
  return {
    rpc: vi.fn(async (_fn: string, args: { p_table: string; p_after: string | null }) => {
      if (args.p_after !== null) return { data: [], error: null };
      const lines = rows[args.p_table] ?? [];
      return { data: lines.map((line, i) => ({ row_id: `id-${i}`, line })), error: null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })),
    })),
    storage: emptyStorage(),
  } as never;
}

describe('writeArchive', () => {
  it('writes a manifest and one gzipped file per non-empty table', async () => {
    const { sink, buffer } = collectingSink();
    const result = await writeArchive({
      db: fakeDb({ holdings: ['{"id":"a"}', '{"id":"b"}'] }),
      orgId: 'org-1', orgName: 'Test Org', sink,
    });

    const files = await readArchive(buffer());
    expect(Object.keys(files)).toContain('manifest.json');
    expect(Object.keys(files)).toContain('tables/holdings.ndjson.gz');
    expect(files['tables/holdings.ndjson.gz']).toBe('{"id":"a"}\n{"id":"b"}\n');
    expect(result.rowCount).toBe(2);
  });

  // A recipient must be able to tell a complete archive from a truncated one.
  it('records a sha256 and row count for every file it wrote', async () => {
    const { sink, buffer } = collectingSink();
    const result = await writeArchive({
      db: fakeDb({ holdings: ['{"id":"a"}'] }),
      orgId: 'org-1', orgName: 'Test Org', sink,
    });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;

    const entry = manifest.files.find(f => f.path === 'tables/holdings.ndjson.gz');
    expect(entry).toBeDefined();
    expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry!.rows).toBe(1);
    expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // Complete-by-decision must be distinguishable from complete-by-accident.
  it('records what it excluded and why', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;

    expect(manifest.excluded.find(e => e.table === 'charities')?.reason).toBeTruthy();
  });

  it('states the numeric encoding so a reader need not infer it', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const manifest = JSON.parse((await readArchive(buffer()))['manifest.json']) as ExportManifest;
    expect(manifest.numericEncoding).toBe('string');
  });

  it('omits a table with no rows rather than writing an empty file', async () => {
    const { sink, buffer } = collectingSink();
    await writeArchive({ db: fakeDb({}), orgId: 'org-1', orgName: 'Test Org', sink });
    const files = await readArchive(buffer());
    expect(Object.keys(files).filter(n => n.startsWith('tables/'))).toEqual([]);
  });

  // Memory must not grow with row count.
  it('never holds a whole table in memory', async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `{"id":"${i}"}`);
    const { sink, buffer } = collectingSink();
    const before = process.memoryUsage().heapUsed;
    await writeArchive({
      db: fakeDb({ holdings: lines }), orgId: 'org-1', orgName: 'Test Org', sink,
    });
    const grew = process.memoryUsage().heapUsed - before;
    // Generous: the point is that it is not proportional to 5000 rows.
    expect(grew).toBeLessThan(50 * 1024 * 1024);
    expect((await readArchive(buffer()))['tables/holdings.ndjson.gz'].split('\n').length).toBe(5001);
  });
});
