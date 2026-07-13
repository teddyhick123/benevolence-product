// lib/builder/review-gate.ts
//
// Decides whether a proposal's current revision is PR-eligible, based on the
// normalized durable-data-contract records (Builder Increment 2): a
// revision, the latest review attempt for that revision, that attempt's
// findings, and that attempt's verification runs. A numeric score is never
// an authorization signal (audit Phase 0, item 2) — only open blocking
// findings and record integrity matter. Fails closed everywhere: absence of
// evidence (no attempt, no revision, null hashes, missing verification
// runs) always blocks, never passes by default.
//
// Also houses parseModelReviewOutput, the strict validator for the
// automated reviewer's raw JSON output — a parse failure is an
// infrastructure failure (null) and must never be treated as an empty,
// passing report.

import type { FindingRow, ReviewAttemptRow, RevisionRow, VerificationRunRow } from './proposal-state';

export const BLOCKING_SEVERITIES = new Set(['blocker', 'error']);

export interface AttemptGateInput {
  proposal: { code_state: string; current_revision_id: string | null };
  revision: RevisionRow | null;
  attempt: ReviewAttemptRow | null; // latest attempt for the CURRENT revision
  findings: FindingRow[]; // that attempt's findings
  verificationRuns: VerificationRunRow[]; // that attempt's runs
  currentPolicyVersion: string; // pass REVIEW_POLICY_VERSION
}

export interface ReviewGateResult {
  pass: boolean;
  blockers: string[];
  reason: string | null;
}

function fail(reason: string): ReviewGateResult {
  return { pass: false, blockers: [], reason };
}

/**
 * Evaluates whether a proposal's current revision passes the review gate.
 * Fail clauses are checked in order below; the first one that fires wins
 * the `reason` string (Task 8's tests assert against these exact strings).
 */
export function evaluateAttemptGate(input: AttemptGateInput): ReviewGateResult {
  const { proposal, revision, attempt, findings, verificationRuns, currentPolicyVersion } = input;

  if (!proposal.current_revision_id) {
    return fail('Proposal has no current revision to review.');
  }
  if (!revision) {
    return fail('No revision record found for the current revision.');
  }
  if (!revision.manifest_hash || !revision.diff_hash) {
    return fail('Current revision is missing a manifest or diff hash.');
  }
  if (!attempt) {
    return fail('No review attempt found for the current revision.');
  }
  if (attempt.revision_id !== proposal.current_revision_id) {
    return fail('Latest review attempt does not belong to the current revision.');
  }
  if (attempt.status !== 'passed' || !attempt.completed_at) {
    return fail('Review attempt has not completed successfully.');
  }
  if (attempt.policy_version !== currentPolicyVersion) {
    return fail('Review attempt was evaluated under an outdated review policy.');
  }

  const blockers = findings
    .filter(finding => finding.state === 'open' && BLOCKING_SEVERITIES.has(finding.severity))
    .map(finding => finding.evidence);
  if (blockers.length > 0) {
    return { pass: false, blockers, reason: 'Automated review reported unresolved blocking findings.' };
  }

  const passedCheckKeys = new Set(
    verificationRuns.filter(run => run.status === 'passed').map(run => run.check_key)
  );
  const missingChecks = attempt.required_check_keys.filter(key => !passedCheckKeys.has(key));
  if (missingChecks.length > 0) {
    return fail('Required verification checks have not passed.');
  }

  return { pass: true, blockers: [], reason: null };
}

// ============================================================
// parseModelReviewOutput — strict validator for the automated reviewer's
// raw JSON output (replaces the old parseReviewReport).
// ============================================================

export interface ParsedModelReview {
  summaryScore: number | null;
  findings: Array<
    Pick<FindingRow, 'severity' | 'category' | 'file_path' | 'line_start' | 'line_end' | 'evidence' | 'recommendation'>
  >;
}

const VALID_SEVERITIES = new Set(['blocker', 'error', 'warning', 'info']);

function normalizeSeverity(raw: unknown): FindingRow['severity'] | null {
  if (typeof raw !== 'string') return null;
  const lowered = raw.toLowerCase();
  const normalized = lowered === 'critical' ? 'blocker' : lowered;
  return VALID_SEVERITIES.has(normalized) ? (normalized as FindingRow['severity']) : null;
}

function optionalString(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined; // undefined signals "invalid" to the caller
  return raw;
}

function optionalNumber(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return raw;
}

/**
 * Strictly validates the automated reviewer's raw JSON output. Returns null
 * on ANY malformed shape — including a single bad finding among otherwise
 * valid ones — never a partial or empty-findings "pass". A null return
 * means the caller must treat the attempt as an infrastructure failure, not
 * as a clean report with no findings.
 */
export function parseModelReviewOutput(value: unknown): ParsedModelReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;

  const summaryScore = optionalNumber(record.summary_score);
  if (summaryScore === undefined) return null;

  if (!Array.isArray(record.findings)) return null;

  const findings: ParsedModelReview['findings'] = [];
  for (const item of record.findings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;

    const severity = normalizeSeverity(raw.severity);
    if (!severity) return null;

    if (typeof raw.evidence !== 'string' || raw.evidence.length === 0) return null;

    const category = optionalString(raw.category);
    if (category === undefined) return null;

    const filePath = optionalString(raw.file_path);
    if (filePath === undefined) return null;

    const lineStart = optionalNumber(raw.line_start);
    if (lineStart === undefined) return null;

    const lineEnd = optionalNumber(raw.line_end);
    if (lineEnd === undefined) return null;

    const recommendation = optionalString(raw.recommendation);
    if (recommendation === undefined) return null;

    findings.push({
      severity,
      category,
      file_path: filePath,
      line_start: lineStart,
      line_end: lineEnd,
      evidence: raw.evidence,
      recommendation,
    });
  }

  return { summaryScore, findings };
}
