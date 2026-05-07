// lib/import/utils/normalize-ein.ts
// Normalizes various EIN input formats to XX-XXXXXXX or null

const EIN_FORMAT = /^\d{2}-\d{7}$/;
const NULL_VALUES = new Set(['', 'null', 'n/a', 'na', 'none', 'undefined']);

/**
 * Normalizes EIN to XX-XXXXXXX format.
 *
 * Handles:
 *  '123456789'   (9 digits)  → '12-3456789'
 *  '12-3456789'  (already)   → '12-3456789'
 *  '0123456789'  (10 digits) → strip leading 0 → '12-3456789'
 *  '12345678'    (8 digits)  → pad with leading 0 → '01-2345678'
 *  'N/A', null, ''           → null
 */
export function normalizeEIN(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (NULL_VALUES.has(trimmed.toLowerCase())) return null;

  // Already correctly formatted
  if (EIN_FORMAT.test(trimmed)) return trimmed;

  // Strip non-digit characters
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 0) return null;

  // 9 digits → XX-XXXXXXX
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }

  // 10 digits → try stripping leading zero
  if (digits.length === 10 && digits[0] === '0') {
    const stripped = digits.slice(1);
    return `${stripped.slice(0, 2)}-${stripped.slice(2)}`;
  }

  // 8 digits → pad with leading zero
  if (digits.length === 8) {
    const padded = '0' + digits;
    return `${padded.slice(0, 2)}-${padded.slice(2)}`;
  }

  // Unknown format — return null
  return null;
}
