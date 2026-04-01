// lib/import/utils/date-parser.ts
// Robust date parsing for messy import data

const NULL_VALUES = new Set(['', 'null', 'n/a', 'na', 'none', 'undefined']);

/**
 * Tries multiple date formats in order and returns ISO YYYY-MM-DD string or null.
 *
 * Formats tried:
 *  YYYY-MM-DD
 *  MM/DD/YYYY or M/D/YYYY
 *  MM-DD-YYYY
 *  YYYYMMDD
 *  'January 1, 2024' (locale-style)
 *  Unix timestamp (numeric string)
 *  Native Date fallback
 */
export function parseFlexibleDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (NULL_VALUES.has(v.toLowerCase())) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : v;
  }

  // MM/DD/YYYY or M/D/YYYY
  const mdySlash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdySlash) {
    const [, m, d, y] = mdySlash;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const date = new Date(iso + 'T00:00:00');
    return isNaN(date.getTime()) ? null : iso;
  }

  // MM-DD-YYYY
  const mdyDash = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyDash) {
    const [, m, d, y] = mdyDash;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const date = new Date(iso + 'T00:00:00');
    return isNaN(date.getTime()) ? null : iso;
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(v)) {
    const y = v.slice(0, 4);
    const m = v.slice(4, 6);
    const d = v.slice(6, 8);
    const iso = `${y}-${m}-${d}`;
    const date = new Date(iso + 'T00:00:00');
    return isNaN(date.getTime()) ? null : iso;
  }

  // Unix timestamp (numeric string)
  if (/^\d{10,13}$/.test(v)) {
    const ts = parseInt(v, 10);
    const ms = v.length === 10 ? ts * 1000 : ts;
    const date = new Date(ms);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }

  // 'Month D, YYYY' or 'Month DD, YYYY'
  const monthName = v.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const date = new Date(v);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  }

  // Native Date fallback
  const date = new Date(v);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Derives tax year from a contribution date.
 *
 * By default, contributions dated Jan-Mar are considered prior-year
 * (e.g., filed in Q1 of following year for prior tax year).
 * Pass priorYearMonths=[] to disable this behavior.
 *
 * @param contributionDate ISO date string YYYY-MM-DD
 * @param priorYearMonths  Month numbers (1-indexed) where contribution is prior-year
 * @returns tax year integer
 */
export function deriveTaxYear(
  contributionDate: string,
  priorYearMonths: number[] = []
): number {
  const d = new Date(contributionDate + 'T00:00:00');
  if (isNaN(d.getTime())) {
    return new Date().getFullYear();
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-indexed
  if (priorYearMonths.includes(month)) {
    return year - 1;
  }
  return year;
}
