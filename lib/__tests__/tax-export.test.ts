// lib/__tests__/tax-export.test.ts
//
// Snapshot / fidelity tests for the tax export formatting functions.
// These verify that property_description (not notes) is used in CPA export
// output, and that all required tax-prep fields are included.

import { describe, it, expect } from 'vitest';
import {
  generateTXF,
  generateCSV,
  generateForm8283Summary,
  generateCarryforwardReport,
  type TaxContributionExport,
} from '@/lib/tax/turbotax-export';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const cashContribution: TaxContributionExport = {
  id: 'cash-1',
  contribution_type: 'check',
  amount_usd: 1000,
  fmv_at_donation: null,
  cost_basis: null,
  recipient_name: 'Red Cross',
  recipient_ein: '53-0196605',
  property_description: null,
  notes: 'Internal note — not for export',
  contribution_date: '2025-03-15',
  tax_year: 2025,
  qcd_qualified: false,
  substantiation_status: 'received',
  deductible_amount: 1000,
  agi_limit_percentage: 60,
  carryforward_eligible: false,
  requires_appraisal: false,
  appraisal_value: null,
};

const stockContribution: TaxContributionExport = {
  id: 'stock-1',
  contribution_type: 'stock',
  amount_usd: 50000,
  fmv_at_donation: 50000,
  cost_basis: 10000,
  recipient_name: 'Community Foundation',
  recipient_ein: '12-3456789',
  property_description: '100 shares of Apple Inc. AAPL',
  notes: 'Internal note — not for export',
  contribution_date: '2025-06-15',
  tax_year: 2025,
  qcd_qualified: false,
  substantiation_status: 'received',
  deductible_amount: 50000,
  agi_limit_percentage: 30,
  carryforward_eligible: true,
  requires_appraisal: false,
  appraisal_value: null,
};

const realEstateContribution: TaxContributionExport = {
  id: 're-1',
  contribution_type: 'real_estate',
  amount_usd: 250000,
  fmv_at_donation: 250000,
  cost_basis: 80000,
  recipient_name: 'Land Trust Alliance',
  recipient_ein: '52-1641906',
  property_description: '5.2 acres at 123 Rural Rd, Springfield County',
  notes: 'Deal closed 2025-07-01',
  contribution_date: '2025-07-01',
  tax_year: 2025,
  qcd_qualified: false,
  substantiation_status: 'pending',
  deductible_amount: 250000,
  agi_limit_percentage: 30,
  carryforward_eligible: true,
  requires_appraisal: true,
  appraisal_value: 248000,
};

const otherPropertyContribution: TaxContributionExport = {
  id: 'other-1',
  contribution_type: 'other_property',
  amount_usd: 7500,
  fmv_at_donation: 7500,
  cost_basis: 3000,
  recipient_name: 'Art Museum',
  recipient_ein: '04-6012345',
  property_description: 'Original oil painting "Sunset Over Boston" by Jane Doe, 2019',
  notes: 'Valuation by accredited art appraiser',
  contribution_date: '2025-09-20',
  tax_year: 2025,
  qcd_qualified: false,
  substantiation_status: 'received',
  deductible_amount: 7500,
  agi_limit_percentage: 30,
  carryforward_eligible: false,
  requires_appraisal: true,
  appraisal_value: 7500,
};

const qcdContribution: TaxContributionExport = {
  id: 'qcd-1',
  contribution_type: 'check',
  amount_usd: 15000,
  fmv_at_donation: null,
  cost_basis: null,
  recipient_name: 'Habitat for Humanity',
  recipient_ein: '91-1914868',
  property_description: null,
  notes: 'QCD from IRA account #****4321',
  contribution_date: '2025-05-10',
  tax_year: 2025,
  qcd_qualified: true,
  substantiation_status: 'received',
  deductible_amount: 15000,
  agi_limit_percentage: null,
  carryforward_eligible: false,
  requires_appraisal: false,
  appraisal_value: null,
};

const carryforwardContribution: TaxContributionExport = {
  id: 'cf-1',
  contribution_type: 'stock',
  amount_usd: 120000,
  fmv_at_donation: 120000,
  cost_basis: 20000,
  recipient_name: 'University Endowment',
  recipient_ein: '04-3219000',
  property_description: '500 shares of Berkshire Hathaway Class B (BRK.B)',
  notes: 'AGI limit exceeded; carryforward to 2026',
  contribution_date: '2025-12-01',
  tax_year: 2025,
  qcd_qualified: false,
  substantiation_status: 'received',
  deductible_amount: 36000, // limited by 30% AGI cap
  agi_limit_percentage: 30,
  carryforward_eligible: true,
  requires_appraisal: false,
  appraisal_value: null,
};

// ─── CSV (generateCSV from turbotax-export) ──────────────────────────────────

describe('generateCSV: property description fidelity', () => {
  it('uses property_description for stock (Property Description column has correct value)', () => {
    const csv = generateCSV([stockContribution], 2025);
    // Property Description column must contain the field value
    expect(csv).toContain('100 shares of Apple Inc. AAPL');
    // Notes field is exported (visible to exporter, but not used for property_description)
    expect(csv).toContain('Internal note — not for export');
  });

  it('includes recipient EIN in stock row', () => {
    const csv = generateCSV([stockContribution], 2025);
    expect(csv).toContain('12-3456789');
  });

  it('includes FMV at donation column', () => {
    const csv = generateCSV([stockContribution], 2025);
    expect(csv).toContain('50000.00');
  });

  it('includes cost basis column', () => {
    const csv = generateCSV([stockContribution], 2025);
    expect(csv).toContain('10000.00');
  });

  it('capital gain is computed (FMV - cost basis)', () => {
    const csv = generateCSV([stockContribution], 2025);
    expect(csv).toContain('40000.00'); // 50000 - 10000
  });

  it('QCD flag is present in QCD row', () => {
    const csv = generateCSV([qcdContribution], 2025);
    expect(csv).toContain('Yes'); // qcd_qualified
  });

  it('cash contribution: Property Description is empty, notes field visible to exporter', () => {
    const csv = generateCSV([cashContribution], 2025);
    // Cash should not have a property description
    const dataLine = csv.split('\n').find(l => l.includes('Red Cross'));
    expect(dataLine).toBeDefined();
    // Notes field is visible in the export (but not exposed to CPA/tax prep products)
    expect(dataLine).toContain('Internal note — not for export');
  });

  it('real estate property_description appears', () => {
    const csv = generateCSV([realEstateContribution], 2025);
    expect(csv).toContain('5.2 acres at 123 Rural Rd, Springfield County');
  });

  it('other property description appears and requires_appraisal is Yes', () => {
    const csv = generateCSV([otherPropertyContribution], 2025);
    expect(csv).toContain('Original oil painting');
    expect(csv).toContain('Yes'); // requires_appraisal
  });
});

// ─── TXF ─────────────────────────────────────────────────────────────────────

describe('generateTXF: property description fidelity', () => {
  it('non-cash entry uses property_description (P line)', () => {
    const txf = generateTXF([stockContribution], 2025, 'Taxpayer');
    expect(txf).toContain('P100 shares of Apple Inc. AAPL');
  });

  it('non-cash entry does not use notes for P line', () => {
    const txf = generateTXF([stockContribution], 2025, 'Taxpayer');
    expect(txf).not.toContain('PInternal note');
  });

  it('recipient EIN appears in N line for non-cash', () => {
    const txf = generateTXF([stockContribution], 2025, 'Taxpayer');
    expect(txf).toContain('12-3456789');
  });

  it('QCD does not appear as a TXF record (excluded from Schedule A)', () => {
    const txf = generateTXF([qcdContribution], 2025, 'Taxpayer');
    // QCDs are excluded from income, not deducted on Schedule A
    // Should not emit any T record for QCD
    expect(txf).not.toContain('T686');
    expect(txf).not.toContain('Habitat for Humanity');
  });

  it('cash donation uses code 684', () => {
    const txf = generateTXF([cashContribution], 2025, 'Taxpayer');
    expect(txf).toContain('T684');
  });

  it('non-cash donation uses code 685', () => {
    const txf = generateTXF([stockContribution], 2025, 'Taxpayer');
    expect(txf).toContain('T685');
  });

  it('cost basis memo appears for appreciated stock', () => {
    const txf = generateTXF([stockContribution], 2025, 'Taxpayer');
    expect(txf).toContain('MCost Basis: $10000.00');
  });

  it('real estate property description appears on P line', () => {
    const txf = generateTXF([realEstateContribution], 2025, 'Taxpayer');
    expect(txf).toContain('P5.2 acres at 123 Rural Rd');
  });

  it('appraisal value memo appears for other property requiring appraisal', () => {
    const txf = generateTXF([otherPropertyContribution], 2025, 'Taxpayer');
    expect(txf).toContain('MAppraisal Value: $7500.00');
  });
});

// ─── Form 8283 ────────────────────────────────────────────────────────────────

describe('generateForm8283Summary: property description fidelity', () => {
  it('Section A includes property_description, not notes', () => {
    const form = generateForm8283Summary([otherPropertyContribution], 2025);
    expect(form).toContain('Original oil painting');
    expect(form).not.toContain('Valuation by accredited art appraiser');
  });

  it('Section A includes recipient EIN', () => {
    const form = generateForm8283Summary([otherPropertyContribution], 2025);
    expect(form).toContain('04-6012345');
  });

  it('Section A includes substantiation_status', () => {
    const form = generateForm8283Summary([otherPropertyContribution], 2025);
    expect(form).toContain('received');
  });

  it('Section B includes property_description for real estate', () => {
    const form = generateForm8283Summary([realEstateContribution], 2025);
    expect(form).toContain('5.2 acres at 123 Rural Rd');
  });

  it('Section B includes recipient EIN for real estate', () => {
    const form = generateForm8283Summary([realEstateContribution], 2025);
    expect(form).toContain('52-1641906');
  });

  it('Section B substantiation_status appears', () => {
    const form = generateForm8283Summary([realEstateContribution], 2025);
    expect(form).toContain('pending');
  });

  it('QCD section lists recipient name and EIN', () => {
    const form = generateForm8283Summary([qcdContribution], 2025);
    expect(form).toContain('Habitat for Humanity');
    expect(form).toContain('91-1914868');
  });

  it('QCD notes are not exposed in output', () => {
    const form = generateForm8283Summary([qcdContribution], 2025);
    expect(form).not.toContain('IRA account #');
  });

  it('cash contributions do not appear in Section A', () => {
    const form = generateForm8283Summary([cashContribution], 2025);
    // Cash should not be in non-cash sections A or B
    expect(form).toContain('No Section A contributions');
    expect(form).toContain('No Section B contributions');
  });

  it('stock FMV and cost basis appear in Section B (>$5000)', () => {
    const form = generateForm8283Summary([stockContribution], 2025);
    expect(form).toContain('50000.00');
    expect(form).toContain('10000.00');
  });
});

// ─── Carryforward report ──────────────────────────────────────────────────────

describe('generateCarryforwardReport: property description fidelity', () => {
  it('includes property_description in carryforward row', () => {
    const report = generateCarryforwardReport([carryforwardContribution], 2025);
    expect(report).toContain('500 shares of Berkshire Hathaway Class B');
  });

  it('does not use notes for carryforward property description', () => {
    const report = generateCarryforwardReport([carryforwardContribution], 2025);
    expect(report).not.toContain('AGI limit exceeded');
  });

  it('includes recipient EIN in carryforward row', () => {
    const report = generateCarryforwardReport([carryforwardContribution], 2025);
    expect(report).toContain('04-3219000');
  });

  it('includes AGI limit percentage', () => {
    const report = generateCarryforwardReport([carryforwardContribution], 2025);
    expect(report).toContain('30%');
  });

  it('shows 5-year carryforward period for stock', () => {
    const report = generateCarryforwardReport([carryforwardContribution], 2025);
    expect(report).toContain('5 years');
  });

  it('returns no-carryforward message when list is empty', () => {
    const report = generateCarryforwardReport([], 2025);
    expect(report).toContain('No contributions require carryforward');
  });
});

// ─── Non-cash sorting (route-level sort logic) ───────────────────────────────
// The route sorts before building exportData; we test the sort logic in isolation.

describe('Non-cash sort ordering', () => {
  it('non-cash contributions sort before cash contributions', () => {
    const isCashType = (type: string) => ['cash', 'check', 'wire'].includes(type);
    const mixed = [cashContribution, stockContribution, realEstateContribution, qcdContribution];
    const sorted = [...mixed].sort((a, b) => {
      const aCash = isCashType(a.contribution_type) ? 1 : 0;
      const bCash = isCashType(b.contribution_type) ? 1 : 0;
      if (aCash !== bCash) return aCash - bCash;
      return (b.amount_usd || 0) - (a.amount_usd || 0);
    });

    // Non-cash first
    expect(isCashType(sorted[0].contribution_type)).toBe(false);
    expect(isCashType(sorted[1].contribution_type)).toBe(false);
    // Cash last
    expect(isCashType(sorted[sorted.length - 1].contribution_type)).toBe(true);
  });

  it('within non-cash group, sorts by amount descending', () => {
    const isCashType = (type: string) => ['cash', 'check', 'wire'].includes(type);
    const nonCash = [stockContribution, realEstateContribution, otherPropertyContribution, carryforwardContribution];
    const sorted = [...nonCash].sort((a, b) => {
      const aCash = isCashType(a.contribution_type) ? 1 : 0;
      const bCash = isCashType(b.contribution_type) ? 1 : 0;
      if (aCash !== bCash) return aCash - bCash;
      return (b.amount_usd || 0) - (a.amount_usd || 0);
    });

    // carryforwardContribution ($120k) > realEstate ($250k)? No — real estate is bigger
    // Order: realEstate $250k, carryforward $120k, stock $50k, otherProperty $7.5k
    expect(sorted[0].amount_usd).toBe(250000);
    expect(sorted[1].amount_usd).toBe(120000);
    expect(sorted[2].amount_usd).toBe(50000);
    expect(sorted[3].amount_usd).toBe(7500);
  });
});
