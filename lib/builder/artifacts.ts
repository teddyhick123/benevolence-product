// lib/builder/artifacts.ts
//
// Canonical hashing + artifact I/O primitives for the Builder durable data
// contract (Builder Increment 2). Pure functions for building/hashing
// revision artifacts (file manifests, unified diffs, canonical JSON), plus
// thin storage helpers over the private `builder-artifacts` bucket
// (migration 0025). The client is always passed in by the caller, never
// constructed here (mirrors lib/builder/proposal-state.ts).
//
// This module does not wire itself into revision-building, review, or
// apply flows — later tasks (5, 7, 8, 9) call into it.

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProposalPath } from './path-policy';

const BUCKET = 'builder-artifacts';

// ============================================================
// Canonical JSON + hashing
// ============================================================

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Recursive key-sorted JSON serialization with no whitespace. Array order is preserved. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** SHA-256 hex digest of a UTF-8 string (matches lib/tax/cpa-collaboration.ts's hashShareToken pattern). */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// ============================================================
// File manifest
// ============================================================

export interface FileManifest {
  entries: { path: string; bytes: number; contentSha256: string }[];
  fileCount: number;
  totalBytes: number;
}

/** Normalizes every path, sorts entries lexically by path, and byte-counts via Buffer.byteLength. */
export function buildFileManifest(files: { path: string; content: string }[]): FileManifest {
  const entries = files
    .map(file => {
      const path = normalizeProposalPath(file.path);
      return {
        path,
        bytes: Buffer.byteLength(file.content, 'utf8'),
        contentSha256: sha256Hex(file.content),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    entries,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

/** sha256Hex(canonicalJson(manifest)) — the tamper-detection anchor for a revision's file set. */
export function manifestHash(manifest: FileManifest): string {
  return sha256Hex(canonicalJson(manifest));
}

// ============================================================
// Unified diff (add-hunks vs /dev/null when a file has no base content)
// ============================================================

interface SplitLines {
  lines: string[];
  trailingNewline: boolean;
}

function splitLines(content: string): SplitLines {
  if (content === '') return { lines: [], trailingNewline: false };
  const trailingNewline = content.endsWith('\n');
  const body = trailingNewline ? content.slice(0, -1) : content;
  return { lines: body.split('\n'), trailingNewline };
}

function buildAddHunk(path: string, content: string): string {
  const { lines, trailingNewline } = splitLines(content);
  const block = [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`];
  for (const line of lines) block.push(`+${line}`);
  if (lines.length > 0 && !trailingNewline) block.push('\\ No newline at end of file');
  return block.join('\n');
}

function buildModifyHunk(path: string, base: string, content: string): string {
  const oldSplit = splitLines(base);
  const newSplit = splitLines(content);
  const block = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${oldSplit.lines.length} +1,${newSplit.lines.length} @@`,
  ];
  for (const line of oldSplit.lines) block.push(`-${line}`);
  if (oldSplit.lines.length > 0 && !oldSplit.trailingNewline) block.push('\\ No newline at end of file');
  for (const line of newSplit.lines) block.push(`+${line}`);
  if (newSplit.lines.length > 0 && !newSplit.trailingNewline) block.push('\\ No newline at end of file');
  return block.join('\n');
}

/**
 * Builds a unified diff for a proposal's file set. Files absent from
 * `baseContents` (or when `baseContents` is omitted entirely) are rendered
 * as add-hunks against `/dev/null` — the only case Builder proposals emit
 * today (scaffold generation only creates new files). Files present in
 * `baseContents` with different content render as whole-file replace hunks;
 * files whose content matches their base exactly are omitted.
 */
export function buildUnifiedDiff(
  files: { path: string; content: string }[],
  baseContents?: Map<string, string>
): string {
  const blocks: string[] = [];
  for (const file of files) {
    const path = normalizeProposalPath(file.path);
    const base = baseContents?.get(path);
    if (base === file.content) continue;
    blocks.push(base === undefined ? buildAddHunk(path, file.content) : buildModifyHunk(path, base, file.content));
  }
  return blocks.join('\n');
}

// ============================================================
// Log redaction + truncation
// ============================================================

const REDACTION_PATTERNS: RegExp[] = [
  /Bearer [A-Za-z0-9._-]+/g,
  /sk-[A-Za-z0-9]+/g,
  /eyJ[A-Za-z0-9._-]+/g,
  /[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=\S+/g,
];

/** Redacts secret-shaped substrings, then caps the result at maxBytes (UTF-8 safe), appending a truncation marker. */
export function capAndRedactLog(text: string, maxBytes: number): string {
  let redacted = text;
  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, '[redacted]');
  }

  const totalBytes = Buffer.byteLength(redacted, 'utf8');
  if (totalBytes <= maxBytes) return redacted;

  const buf = Buffer.from(redacted, 'utf8');
  let kept = buf.subarray(0, maxBytes).toString('utf8');
  kept = kept.replace(/�+$/, ''); // drop a partial multi-byte tail introduced by the byte-level cut
  const droppedBytes = totalBytes - Buffer.byteLength(kept, 'utf8');

  return `${kept}\n…[truncated ${droppedBytes} bytes]`;
}

// ============================================================
// Artifact keys
// ============================================================

/** orgId/proposalId/revisionId — matches the artifact_prefix format set by builder_claim_code_run (migration 0025). */
export function artifactPrefix(orgId: string, proposalId: string, revisionId: string): string {
  return `${orgId}/${proposalId}/${revisionId}`;
}

export const ARTIFACT_KEYS = {
  context: 'context.json',
  files: 'files.json',
  manifest: 'manifest.json',
  diff: 'diff.patch',
  reviewPrompt: (attemptId: string) => `review/${attemptId}/prompt.txt`,
  reviewResponse: (attemptId: string) => `review/${attemptId}/response.json`,
  checkLog: (checkKey: string) => `checks/${checkKey}.log`,
} as const;

// ============================================================
// Storage helpers (private `builder-artifacts` bucket, migration 0025)
// ============================================================

function isNotFoundStorageError(error: { message?: string } | null): boolean {
  return typeof error?.message === 'string' && /not found/i.test(error.message);
}

/**
 * Reads the string contents of a storage `download()` result. supabase-js
 * resolves `data` to a Blob; Node's native Blob supports `.text()`, so that
 * is the primary path. Falls back to `.arrayBuffer()` and, if the client
 * ever hands back a plain string, uses it directly.
 */
async function blobLikeToText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  const blobLike = data as { text?: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof blobLike.text === 'function') return blobLike.text();
  if (typeof blobLike.arrayBuffer === 'function') {
    return Buffer.from(await blobLike.arrayBuffer()).toString('utf8');
  }
  throw new Error('readJsonArtifact: unsupported storage download() result shape');
}

/** Uploads a value as canonical JSON. Artifacts are immutable, so upload always uses upsert:false. */
export async function putJsonArtifact(admin: SupabaseClient, key: string, value: unknown): Promise<void> {
  await putTextArtifact(admin, key, canonicalJson(value), 'application/json');
}

/** Uploads raw text. Artifacts are immutable, so upload always uses upsert:false. */
export async function putTextArtifact(
  admin: SupabaseClient,
  key: string,
  body: string,
  contentType: string = 'text/plain'
): Promise<void> {
  const { error } = await admin.storage.from(BUCKET).upload(key, body, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
}

/** Downloads and JSON-parses a stored artifact. Returns null if the object does not exist. */
export async function readJsonArtifact<T>(admin: SupabaseClient, key: string): Promise<T | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(key);
  if (error) {
    if (isNotFoundStorageError(error)) return null;
    throw error;
  }
  if (!data) return null;

  const text = await blobLikeToText(data);
  return JSON.parse(text) as T;
}

/** Signs a time-limited URL for a stored artifact. Returns null if the object cannot be signed (e.g. missing). */
export async function signArtifactUrl(
  admin: SupabaseClient,
  key: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(key, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
