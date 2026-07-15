// lib/builder/__tests__/artifacts.test.ts
//
// Task 3 — canonical hashing + artifact I/O primitives for the Builder
// durable data contract. Covers: key-sorted canonical JSON serialization,
// SHA-256 hash determinism, file-manifest normalization/sorting/byte
// counting, unified add-diff generation (single-line/empty/no-trailing-
// newline files), log redaction + byte-cap truncation, and the storage
// helper call shapes against a mocked Supabase client.

import { describe, it, expect } from 'vitest';
import {
  canonicalJson,
  sha256Hex,
  buildFileManifest,
  manifestHash,
  buildUnifiedDiff,
  capAndRedactLog,
  artifactPrefix,
  ARTIFACT_KEYS,
  putJsonArtifact,
  putTextArtifact,
  readJsonArtifact,
  signArtifactUrl,
  type FileManifest,
} from '@/lib/builder/artifacts';
import { SupabaseMock } from './helpers/supabase-mock';

const BUCKET = 'builder-artifacts';

// ============================================================
// canonicalJson
// ============================================================

describe('canonicalJson', () => {
  it('produces identical output for structurally-equal objects with different key order', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson(JSON.parse('{"a":{"c":3,"d":2},"b":1}'));
    expect(a).toBe(b);
    expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('emits no extraneous whitespace', () => {
    expect(canonicalJson({ x: [1, 2, 3], y: 'z' })).toBe('{"x":[1,2,3],"y":"z"}');
  });

  it('preserves array element order while sorting nested object keys', () => {
    const out = canonicalJson([{ b: 1, a: 2 }, { d: 3, c: 4 }]);
    expect(out).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });

  it('sorts deeply nested keys at every level', () => {
    const out = canonicalJson({ z: { y: { b: 1, a: 2 } } });
    expect(out).toBe('{"z":{"y":{"a":2,"b":1}}}');
  });

  it('round-trips primitives', () => {
    expect(canonicalJson('hello')).toBe('"hello"');
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(true)).toBe('true');
  });
});

// ============================================================
// sha256Hex
// ============================================================

describe('sha256Hex', () => {
  it('matches the known SHA-256 digest of a fixed string', () => {
    // echo -n "hello" | shasum -a 256
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('is deterministic for repeated calls on the same input', () => {
    expect(sha256Hex('same input')).toBe(sha256Hex('same input'));
  });

  it('differs for different inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('is deterministic across two structurally-different-but-canonically-equal inputs via canonicalJson', () => {
    const h1 = sha256Hex(canonicalJson({ b: 2, a: 1 }));
    const h2 = sha256Hex(canonicalJson({ a: 1, b: 2 }));
    expect(h1).toBe(h2);
  });
});

// ============================================================
// buildFileManifest / manifestHash
// ============================================================

describe('buildFileManifest', () => {
  it('normalizes and sorts paths lexically regardless of input order', () => {
    const manifest = buildFileManifest([
      { path: 'b.ts', content: 'B' },
      { path: './a.ts', content: 'A' },
    ]);
    expect(manifest.entries.map(e => e.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('counts bytes via Buffer.byteLength (multi-byte UTF-8 safe)', () => {
    const content = 'héllo'; // 'é' is 2 bytes in UTF-8
    const manifest = buildFileManifest([{ path: 'x.ts', content }]);
    expect(manifest.entries[0].bytes).toBe(Buffer.byteLength(content, 'utf8'));
    expect(manifest.entries[0].bytes).toBe(6);
  });

  it('computes per-file contentSha256 and aggregate fileCount/totalBytes', () => {
    const files = [
      { path: 'a.ts', content: 'aaa' },
      { path: 'b.ts', content: 'bb' },
    ];
    const manifest = buildFileManifest(files);
    expect(manifest.fileCount).toBe(2);
    expect(manifest.totalBytes).toBe(5);
    expect(manifest.entries[0].contentSha256).toBe(sha256Hex('aaa'));
    expect(manifest.entries[1].contentSha256).toBe(sha256Hex('bb'));
  });

  it('returns an empty manifest for no files', () => {
    const manifest = buildFileManifest([]);
    expect(manifest).toEqual({ entries: [], fileCount: 0, totalBytes: 0 });
  });
});

describe('manifestHash', () => {
  it('equals sha256Hex(canonicalJson(manifest))', () => {
    const manifest: FileManifest = buildFileManifest([{ path: 'a.ts', content: 'A' }]);
    expect(manifestHash(manifest)).toBe(sha256Hex(canonicalJson(manifest)));
  });

  it('is stable for the same manifest content built twice', () => {
    const files = [
      { path: 'z.ts', content: 'zzz' },
      { path: 'a.ts', content: 'aaa' },
    ];
    const h1 = manifestHash(buildFileManifest(files));
    const h2 = manifestHash(buildFileManifest([...files]));
    expect(h1).toBe(h2);
  });

  it('changes when file content changes', () => {
    const h1 = manifestHash(buildFileManifest([{ path: 'a.ts', content: 'A' }]));
    const h2 = manifestHash(buildFileManifest([{ path: 'a.ts', content: 'B' }]));
    expect(h1).not.toBe(h2);
  });
});

// ============================================================
// buildUnifiedDiff — add-hunks vs /dev/null
// ============================================================

describe('buildUnifiedDiff — add hunks (no base)', () => {
  it('emits a correct add-hunk for a single-line file', () => {
    const diff = buildUnifiedDiff([{ path: 'a.ts', content: 'hello\n' }]);
    expect(diff).toBe(['--- /dev/null', '+++ b/a.ts', '@@ -0,0 +1,1 @@', '+hello'].join('\n'));
  });

  it('emits a correct add-hunk for an empty file (zero lines, no content rows)', () => {
    const diff = buildUnifiedDiff([{ path: 'empty.txt', content: '' }]);
    expect(diff).toBe(['--- /dev/null', '+++ b/empty.txt', '@@ -0,0 +1,0 @@'].join('\n'));
  });

  it('appends "No newline at end of file" for content missing a trailing newline', () => {
    const diff = buildUnifiedDiff([{ path: 'a.ts', content: 'hello' }]);
    expect(diff).toBe(
      ['--- /dev/null', '+++ b/a.ts', '@@ -0,0 +1,1 @@', '+hello', '\\ No newline at end of file'].join('\n')
    );
  });

  it('emits correct hunk counts for a multi-line file', () => {
    const diff = buildUnifiedDiff([{ path: 'a.ts', content: 'one\ntwo\nthree\n' }]);
    expect(diff).toBe(
      ['--- /dev/null', '+++ b/a.ts', '@@ -0,0 +1,3 @@', '+one', '+two', '+three'].join('\n')
    );
  });

  it('normalizes the path used in the +++ header', () => {
    const diff = buildUnifiedDiff([{ path: './a.ts', content: 'x\n' }]);
    expect(diff).toContain('+++ b/a.ts');
    expect(diff).not.toContain('./a.ts');
  });

  it('concatenates add-hunks for multiple files in input order', () => {
    const diff = buildUnifiedDiff([
      { path: 'a.ts', content: 'A\n' },
      { path: 'b.ts', content: 'B\n' },
    ]);
    expect(diff).toBe(
      [
        '--- /dev/null',
        '+++ b/a.ts',
        '@@ -0,0 +1,1 @@',
        '+A',
        '--- /dev/null',
        '+++ b/b.ts',
        '@@ -0,0 +1,1 @@',
        '+B',
      ].join('\n')
    );
  });

  it('treats a path absent from baseContents the same as no baseContents at all', () => {
    const withMap = buildUnifiedDiff([{ path: 'a.ts', content: 'hello\n' }], new Map());
    const withoutMap = buildUnifiedDiff([{ path: 'a.ts', content: 'hello\n' }]);
    expect(withMap).toBe(withoutMap);
  });
});

describe('buildUnifiedDiff — unchanged files', () => {
  it('emits nothing for a file whose content matches its base exactly', () => {
    const base = new Map([['a.ts', 'same\n']]);
    const diff = buildUnifiedDiff([{ path: 'a.ts', content: 'same\n' }], base);
    expect(diff).toBe('');
  });
});

// ============================================================
// capAndRedactLog
// ============================================================

describe('capAndRedactLog — redaction', () => {
  it('redacts Bearer tokens', () => {
    const out = capAndRedactLog('Authorization: Bearer abc123.XYZ-_token', 10_000);
    expect(out).toBe('Authorization: [redacted]');
  });

  it('redacts sk- style API keys', () => {
    const out = capAndRedactLog('key=sk-abcDEF1234567890', 10_000);
    expect(out).toBe('key=[redacted]');
  });

  it('redacts JWT-shaped tokens (eyJ...)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ';
    const out = capAndRedactLog(`token is ${jwt} end`, 10_000);
    expect(out).toBe('token is [redacted] end');
  });

  it('redacts KEY/SECRET/TOKEN/PASSWORD env-style assignments', () => {
    expect(capAndRedactLog('API_KEY=abcd1234', 10_000)).toBe('[redacted]');
    expect(capAndRedactLog('DB_PASSWORD=hunter2', 10_000)).toBe('[redacted]');
    expect(capAndRedactLog('MY_SECRET_VALUE=xyz', 10_000)).toBe('[redacted]');
    expect(capAndRedactLog('SESSION_TOKEN=abc.def', 10_000)).toBe('[redacted]');
  });

  it('does not over-match normal code that merely contains the word key/token as an identifier', () => {
    const code = 'const config = { retries: 3 };\nfunction lookupById(id) { return id; }';
    expect(capAndRedactLog(code, 10_000)).toBe(code);
  });

  it('leaves ordinary log lines untouched', () => {
    const text = 'Build started\nCompiling 12 files\nDone in 1.2s';
    expect(capAndRedactLog(text, 10_000)).toBe(text);
  });
});

describe('capAndRedactLog — truncation', () => {
  it('returns the text unchanged when within the byte cap', () => {
    const text = 'short log line';
    expect(capAndRedactLog(text, 1000)).toBe(text);
  });

  it('truncates at the byte cap and appends the truncation marker with the dropped-byte count', () => {
    const text = 'A'.repeat(100); // pure ASCII: 1 byte per char
    const out = capAndRedactLog(text, 20);
    expect(out).toBe(`${'A'.repeat(20)}\n…[truncated 80 bytes]`);
  });

  it('applies redaction before measuring/truncating against the byte cap', () => {
    // "Bearer supersecrettoken12345" (28 bytes) redacts down to "[redacted]" (10 bytes),
    // which fits under a cap that the raw text would have exceeded.
    const out = capAndRedactLog('Bearer supersecrettoken12345', 15);
    expect(out).toBe('[redacted]');
  });
});

// ============================================================
// artifactPrefix / ARTIFACT_KEYS
// ============================================================

describe('artifactPrefix', () => {
  it('joins orgId/proposalId/revisionId matching the migration 0025 RPC format', () => {
    expect(artifactPrefix('org-1', 'prop-1', 'rev-1')).toBe('org-1/prop-1/rev-1');
  });
});

describe('ARTIFACT_KEYS', () => {
  it('exposes the fixed top-level artifact filenames', () => {
    expect(ARTIFACT_KEYS.context).toBe('context.json');
    expect(ARTIFACT_KEYS.files).toBe('files.json');
    expect(ARTIFACT_KEYS.manifest).toBe('manifest.json');
    expect(ARTIFACT_KEYS.diff).toBe('diff.patch');
  });

  it('builds review prompt/response keys scoped to an attempt id', () => {
    expect(ARTIFACT_KEYS.reviewPrompt('att-1')).toBe('review/att-1/prompt.txt');
    expect(ARTIFACT_KEYS.reviewResponse('att-1')).toBe('review/att-1/response.json');
  });

  it('builds check-log keys scoped to a check key', () => {
    expect(ARTIFACT_KEYS.checkLog('typecheck')).toBe('checks/typecheck.log');
  });
});

// ============================================================
// Storage helpers (mocked Supabase client)
// ============================================================

describe('putJsonArtifact', () => {
  it('uploads canonical JSON to builder-artifacts with upsert:false', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageUpload(BUCKET, { data: { path: 'org/prop/rev/manifest.json' }, error: null });

    await putJsonArtifact(mock.client(), 'org/prop/rev/manifest.json', { b: 1, a: 2 });

    const call = mock.calls.find(c => c.method === 'storage.upload');
    expect(call).toBeDefined();
    const [bucket, key, body, options] = call!.args;
    expect(bucket).toBe(BUCKET);
    expect(key).toBe('org/prop/rev/manifest.json');
    expect(body).toBe('{"a":2,"b":1}');
    expect(options).toMatchObject({ upsert: false, contentType: 'application/json' });
  });

  it('throws when the storage upload errors', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageUpload(BUCKET, { data: null, error: { message: 'boom' } });

    await expect(putJsonArtifact(mock.client(), 'k.json', {})).rejects.toThrow('boom');
  });
});

describe('putTextArtifact', () => {
  it('uploads raw text to builder-artifacts with upsert:false', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageUpload(BUCKET, { data: { path: 'k' }, error: null });

    await putTextArtifact(mock.client(), 'org/prop/rev/diff.patch', 'diff body', 'text/x-diff');

    const call = mock.calls.find(c => c.method === 'storage.upload');
    const [bucket, key, body, options] = call!.args;
    expect(bucket).toBe(BUCKET);
    expect(key).toBe('org/prop/rev/diff.patch');
    expect(body).toBe('diff body');
    expect(options).toMatchObject({ upsert: false, contentType: 'text/x-diff' });
  });

  it('defaults contentType to text/plain when omitted', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageUpload(BUCKET, { data: { path: 'k' }, error: null });

    await putTextArtifact(mock.client(), 'k.log', 'body');

    const call = mock.calls.find(c => c.method === 'storage.upload');
    const [, , , options] = call!.args as [unknown, unknown, unknown, { contentType?: string }];
    expect(options?.contentType).toBe('text/plain');
  });
});

describe('signArtifactUrl', () => {
  it('calls createSignedUrl(key, 3600) by default', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageSignedUrl(BUCKET, { data: { signedUrl: 'https://example.test/signed' }, error: null });

    const url = await signArtifactUrl(mock.client(), 'org/prop/rev/manifest.json');

    expect(url).toBe('https://example.test/signed');
    const call = mock.calls.find(c => c.method === 'storage.createSignedUrl');
    expect(call!.args).toEqual([BUCKET, 'org/prop/rev/manifest.json', 3600]);
  });

  it('honors an explicit expiresIn override', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageSignedUrl(BUCKET, { data: { signedUrl: 'https://example.test/signed' }, error: null });

    await signArtifactUrl(mock.client(), 'k', 120);

    const call = mock.calls.find(c => c.method === 'storage.createSignedUrl');
    expect(call!.args).toEqual([BUCKET, 'k', 120]);
  });

  it('returns null when createSignedUrl errors', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageSignedUrl(BUCKET, { data: null, error: { message: 'not found' } });

    const url = await signArtifactUrl(mock.client(), 'missing.json');
    expect(url).toBeNull();
  });
});

describe('readJsonArtifact', () => {
  it('downloads and JSON-parses the stored artifact (Blob-like data with a text() method)', async () => {
    const mock = new SupabaseMock();
    // Real supabase-js storage.download() resolves `data` to a Blob; jsdom's Blob
    // polyfill lacks .text()/.arrayBuffer(), so this duck-types the interface
    // readJsonArtifact actually depends on (Node's native Blob satisfies it too).
    mock.queueStorageDownload(BUCKET, {
      data: { text: async () => JSON.stringify({ hello: 'world' }) },
      error: null,
    });

    const value = await readJsonArtifact<{ hello: string }>(mock.client(), 'org/prop/rev/context.json');
    expect(value).toEqual({ hello: 'world' });
  });

  it('returns null when the object does not exist', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageDownload(BUCKET, { data: null, error: { message: 'Object not found' } });

    const value = await readJsonArtifact(mock.client(), 'missing.json');
    expect(value).toBeNull();
  });

  it('rethrows non-not-found storage errors', async () => {
    const mock = new SupabaseMock();
    mock.queueStorageDownload(BUCKET, { data: null, error: { message: 'network error' } });

    await expect(readJsonArtifact(mock.client(), 'k.json')).rejects.toThrow('network error');
  });

  it('returns null (not a throw) when the stored artifact is not valid JSON', async () => {
    // Regression: a review/{attemptId}/response.json artifact can contain raw
    // markdown-fence-wrapped model text even on a successful review run
    // (flagged by Task 7's reviewer). Callers must never crash on this.
    const mock = new SupabaseMock();
    mock.queueStorageDownload(BUCKET, {
      data: { text: async () => '```json\n{"not": "closed"' },
      error: null,
    });

    const value = await readJsonArtifact(mock.client(), 'org/prop/rev/review/attempt/response.json');
    expect(value).toBeNull();
  });
});
