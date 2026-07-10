// lib/builder/review-gate.ts
//
// Decides whether a stored automated review report makes a proposal
// PR-eligible. Only blocking findings and report integrity matter — a numeric
// score is never an authorization signal (audit Phase 0, item 2). Fails
// closed: a missing or malformed report never passes.

export interface ReviewFinding {
  severity: string;
  description: string;
}

export interface ReviewReport {
  score: number;
  findings: ReviewFinding[];
}

export interface ReviewGateResult {
  pass: boolean;
  blockers: string[];
  reason: string | null;
}

const BLOCKING_SEVERITIES = new Set(['error', 'blocker', 'critical']);

export function parseReviewReport(value: unknown): ReviewReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.score !== 'number' || !Number.isFinite(record.score)) return null;
  if (!Array.isArray(record.findings)) return null;

  const findings: ReviewFinding[] = [];
  for (const item of record.findings) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const finding = item as Record<string, unknown>;
    if (typeof finding.severity !== 'string' || typeof finding.description !== 'string') return null;
    findings.push({ severity: finding.severity, description: finding.description });
  }
  return { score: record.score, findings };
}

export function evaluateReviewGate(value: unknown): ReviewGateResult {
  const report = parseReviewReport(value);
  if (!report) {
    return { pass: false, blockers: [], reason: 'No valid automated review report exists for this proposal.' };
  }
  const blockers = report.findings
    .filter(finding => BLOCKING_SEVERITIES.has(finding.severity.toLowerCase()))
    .map(finding => finding.description);
  if (blockers.length > 0) {
    return { pass: false, blockers, reason: 'Automated review reported blocking findings.' };
  }
  return { pass: true, blockers: [], reason: null };
}
