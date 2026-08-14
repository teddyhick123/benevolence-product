// @vitest-environment node
// tests/integration/tax-export-contract.test.ts
//
// Source-scan contract tests for tax export files.
// These fail if export regression patterns reappear — wrong field mappings,
// invalid TXF codes, or public storage URL leaks.
//
// What is already covered in tax-export.test.ts (not duplicated here):
//   - Property description fidelity in CSV, TXF, Form 8283, carryforward report (36 tests)
//   - Non-cash sort ordering
//   - Correct TXF codes (684/685), QCD exclusion, recipient EIN placement
//
// This file adds *source-scan* contracts so regressions can be detected
// even before runtime tests run — static analysis of file content.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();

function readSource(relPath: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
  } catch {
    return '';
  }
}

const exportRouteSrc = readSource('app/api/portfolio/[id]/tax/export/route.ts');
const turbotaxExportSrc = readSource('lib/tax/turbotax-export.ts');
const documentDownloadRouteSrc = readSource(
  'app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route.ts'
);

// ── Storage URL safety ────────────────────────────────────────────────────────

describe('Tax export contract: no getPublicUrl in export/document routes', () => {
  it('export/route.ts does not call getPublicUrl (documents must stay private)', () => {
    expect(exportRouteSrc).not.toContain('getPublicUrl');
  });

  it('turbotax-export.ts does not call getPublicUrl', () => {
    expect(turbotaxExportSrc).not.toContain('getPublicUrl');
  });

  it('[documentId]/route.ts does not call getPublicUrl (download must use signed URL)', () => {
    expect(documentDownloadRouteSrc).not.toContain('getPublicUrl');
  });
});

// ── TXF code correctness ──────────────────────────────────────────────────────

describe('Tax export contract: TXF line codes are canonical', () => {
  it('turbotax-export.ts does not emit T686 (invalid TXF code)', () => {
    // T686 is not a valid Schedule A code.
    // Valid codes: 684 (cash), 685 (non-cash). QCDs are excluded entirely.
    expect(turbotaxExportSrc).not.toContain('T686');
    expect(turbotaxExportSrc).not.toContain("'686'");
    expect(turbotaxExportSrc).not.toContain('"686"');
  });

  it('turbotax-export.ts uses code 684 for cash donations', () => {
    expect(turbotaxExportSrc).toContain('684');
  });

  it('turbotax-export.ts uses code 685 for non-cash donations', () => {
    expect(turbotaxExportSrc).toContain('685');
  });
});

// ── property_description is used (not notes) ─────────────────────────────────

describe('Tax export contract: property_description field usage', () => {
  it('turbotax-export.ts references property_description (the canonical field)', () => {
    expect(turbotaxExportSrc).toContain('property_description');
  });

  it('export/route.ts maps property_description to propertyDescription (not notes)', () => {
    // The export route must map c.property_description to the output field
    expect(exportRouteSrc).toContain('property_description');
    // Must NOT map notes to the propertyDescription field
    expect(exportRouteSrc).not.toMatch(/propertyDescription\s*:\s*c\.notes/);
  });

  it('export/route.ts does not use notes as a fallback for propertyDescription', () => {
    // Guard against: propertyDescription: c.property_description || c.notes
    expect(exportRouteSrc).not.toMatch(/propertyDescription[^,\n]+\|\|\s*c\.notes/);
  });
});

// ── CSV headers contain canonical column names ────────────────────────────────

describe('Tax export contract: CSV headers include required columns', () => {
  it('export/route.ts CSV headers include "Property Description"', () => {
    // The route-level generateCSV function (for the summary/full export) must
    // include a Property Description column header
    expect(exportRouteSrc).toContain('Property Description');
  });

  it('turbotax-export.ts generateCSV includes "Property Description" header', () => {
    // The standalone generateCSV in turbotax-export.ts must include the column
    expect(turbotaxExportSrc).toContain('Property Description');
  });

  it('export/route.ts CSV headers include "EIN"', () => {
    expect(exportRouteSrc).toMatch(/EIN/);
  });
});

// ── Form 8283 / recipient EIN ─────────────────────────────────────────────────

describe('Tax export contract: Form 8283 output includes recipient_ein', () => {
  it('turbotax-export.ts generateForm8283Summary uses recipient_ein', () => {
    expect(turbotaxExportSrc).toContain('recipient_ein');
  });

  it('turbotax-export.ts generateForm8283Summary is exported', () => {
    expect(turbotaxExportSrc).toContain('export function generateForm8283Summary');
  });
});

// ── Non-cash fields: FMV and cost_basis ──────────────────────────────────────

describe('Tax export contract: non-cash fields are exported', () => {
  it('turbotax-export.ts uses fmv_at_donation for non-cash TXF entries', () => {
    expect(turbotaxExportSrc).toContain('fmv_at_donation');
  });

  it('turbotax-export.ts uses cost_basis for appreciated property', () => {
    expect(turbotaxExportSrc).toContain('cost_basis');
  });

  it('turbotax-export.ts includes cost basis memo in TXF output', () => {
    expect(turbotaxExportSrc).toContain('Cost Basis:');
  });
});

// ── QCD handling ─────────────────────────────────────────────────────────────

describe('Tax export contract: QCD contributions are excluded from TXF', () => {
  it('turbotax-export.ts skips QCD contributions in TXF generation (continue statement)', () => {
    // QCDs are excluded from Schedule A; the function must skip them
    expect(turbotaxExportSrc).toMatch(/isQCD[\s\S]{0,200}continue/);
  });

  it('turbotax-export.ts checks qcd_qualified field', () => {
    expect(turbotaxExportSrc).toContain('qcd_qualified');
  });
});

// ── TaxContributionExport interface completeness ──────────────────────────────

describe('Tax export contract: TaxContributionExport interface includes required fields', () => {
  it('TaxContributionExport interface is exported from turbotax-export.ts', () => {
    expect(turbotaxExportSrc).toContain('export interface TaxContributionExport');
  });

  it('TaxContributionExport property_description JSDoc says "use for CPA exports, NOT notes"', () => {
    // Exact wording prevents silent drift — if the field is renamed or the comment
    // is deleted, the test fails immediately.
    expect(turbotaxExportSrc).toContain('use for CPA exports, NOT notes');
  });

  it('TaxContributionExport notes JSDoc says "NOT for CPA/tax-prep export output"', () => {
    // Exact wording distinguishes this field from property_description and prevents
    // a future developer from accidentally including internal notes in CPA packages.
    expect(turbotaxExportSrc).toContain('NOT for CPA/tax-prep export output');
  });
});

// ── Historical carryforward semantics ────────────────────────────────────────

describe('Tax export contract: historical carryforwards are exported from canonical ledger tables', () => {
  it('export/route.ts does not use current-active carryforward view for historical exports', () => {
    expect(exportRouteSrc).not.toContain("from('v_active_carryforwards')");
  });

  it('export/route.ts queries tax_carryforwards directly with year bracket filters', () => {
    expect(exportRouteSrc).toContain("from('tax_carryforwards')");
    expect(exportRouteSrc).toContain('tax_carryforward_applications');
    expect(exportRouteSrc).toContain(".lte('originating_tax_year', year)");
    expect(exportRouteSrc).toContain(".gte('expires_tax_year', year)");
  });

  it('export/route.ts computes remaining carryforward as of the selected year', () => {
    expect(exportRouteSrc).toContain('applicationsThroughYear');
    expect(exportRouteSrc).toContain('app.applied_tax_year <= year');
    expect(exportRouteSrc).toContain('appliedThroughTaxYear');
  });
});
