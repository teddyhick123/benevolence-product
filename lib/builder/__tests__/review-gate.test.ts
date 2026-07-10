// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evaluateReviewGate, parseReviewReport } from '@/lib/builder/review-gate';

describe('parseReviewReport', () => {
  it('accepts a well-formed report', () => {
    const report = parseReviewReport({ score: 80, findings: [{ severity: 'warning', description: 'Add empty state.' }] });
    expect(report).toEqual({ score: 80, findings: [{ severity: 'warning', description: 'Add empty state.' }] });
  });

  it('rejects null, arrays, missing findings, and malformed findings', () => {
    expect(parseReviewReport(null)).toBeNull();
    expect(parseReviewReport([])).toBeNull();
    expect(parseReviewReport({ score: 80 })).toBeNull();
    expect(parseReviewReport({ score: 'high', findings: [] })).toBeNull();
    expect(parseReviewReport({ score: 80, findings: [{ severity: 'error' }] })).toBeNull();
  });
});

describe('evaluateReviewGate', () => {
  it('passes a report with only warnings', () => {
    const result = evaluateReviewGate({ score: 70, findings: [{ severity: 'warning', description: 'Nit.' }] });
    expect(result.pass).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('passes an empty findings list regardless of score — score is never an authorization signal', () => {
    expect(evaluateReviewGate({ score: 0, findings: [] }).pass).toBe(true);
  });

  it('blocks error findings regardless of a high score', () => {
    const result = evaluateReviewGate({
      score: 98,
      findings: [{ severity: 'error', description: 'Missing RLS policy on new table.' }],
    });
    expect(result.pass).toBe(false);
    expect(result.blockers).toEqual(['Missing RLS policy on new table.']);
  });

  it('treats blocker and critical severities as blocking, case-insensitively', () => {
    expect(evaluateReviewGate({ score: 90, findings: [{ severity: 'Blocker', description: 'x' }] }).pass).toBe(false);
    expect(evaluateReviewGate({ score: 90, findings: [{ severity: 'CRITICAL', description: 'y' }] }).pass).toBe(false);
  });

  it('fails closed when the report is missing or malformed', () => {
    const missing = evaluateReviewGate(null);
    expect(missing.pass).toBe(false);
    expect(missing.reason).toMatch(/review report/i);
    expect(evaluateReviewGate({ score: 50 }).pass).toBe(false);
  });
});
