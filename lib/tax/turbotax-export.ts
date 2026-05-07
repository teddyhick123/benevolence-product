/**
 * TurboTax & TaxAct Export Utilities
 *
 * Generates export files for tax software:
 * - TXF (Tax Exchange Format) for TurboTax, TaxAct, H&R Block
 * - CSV for manual import or spreadsheet analysis
 */

import { getQCDLimit } from './constants';

export interface TaxContributionExport {
  id: string;
  contribution_date: string;
  recipient_name: string;
  recipient_ein?: string | null;
  recipient_type?: string | null;
  contribution_type: string;
  amount_usd: number;
  fmv_at_donation?: number | null;
  cost_basis?: number | null;
  property_description?: string | null;
  deductible_amount?: number | null;
  agi_limit_percentage?: number | null;
  carryforward_eligible?: boolean | null;
  qcd_qualified?: boolean | null;
  requires_appraisal?: boolean | null;
  appraisal_value?: number | null;
  notes?: string | null;
}

/**
 * Generate TXF file content for TurboTax import
 *
 * TXF Format Specification:
 * - Version 41 (for 2024 tax year)
 * - Cash donations: Form 1040, Schedule A, Line 11
 * - Property donations: Form 1040, Schedule A, Line 12
 * - Each contribution is a separate entry
 */
export function generateTXF(
  contributions: TaxContributionExport[],
  taxYear: number,
  donorName: string = 'Taxpayer'
): string {
  const lines: string[] = [];

  // TXF Header
  lines.push('V041'); // Version 41
  lines.push(`APortfolio Tax Export for ${taxYear}`);
  lines.push(`D${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}`);
  lines.push('^');

  // Process each contribution
  for (const contrib of contributions) {
    // Determine if cash or property donation
    const isCash = ['cash', 'check', 'wire'].includes(contrib.contribution_type);
    const isQCD = contrib.qcd_qualified === true;

    if (isQCD) {
      // QCDs are not deducted on Schedule A - they're excluded from income
      // Skip them in the TXF export or add as informational
      continue;
    }

    // Schedule A Line codes:
    // Cash donations to charity: Code 684
    // Other than cash donations to charity: Code 685
    const lineCode = isCash ? '684' : '685';

    // Entry header
    lines.push(`T${lineCode}`); // Transaction type
    lines.push(`C1`); // Category (1 = current year)
    lines.push(`N${contrib.recipient_name}`); // Recipient name

    // Parse date (YYYY-MM-DD to MM/DD/YYYY)
    const date = new Date(contrib.contribution_date);
    const formattedDate = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    lines.push(`D${formattedDate}`);

    if (isCash) {
      // Cash donation
      const amount = contrib.deductible_amount ?? contrib.amount_usd;
      lines.push(`$${amount.toFixed(2)}`);
    } else {
      // Property donation
      const fmv = contrib.fmv_at_donation ?? contrib.amount_usd;
      const costBasis = contrib.cost_basis ?? fmv;

      lines.push(`P${contrib.property_description || contrib.contribution_type}`); // Property description
      lines.push(`$${fmv.toFixed(2)}`); // Fair Market Value

      // Add cost basis as memo
      if (costBasis > 0) {
        lines.push(`MCost Basis: $${costBasis.toFixed(2)}`);
      }

      // Add appraisal note if required
      if (contrib.requires_appraisal && contrib.appraisal_value) {
        lines.push(`MAppraisal Value: $${contrib.appraisal_value.toFixed(2)}`);
      }
    }

    // Add AGI limit note if applicable
    if (contrib.agi_limit_percentage) {
      lines.push(`M${contrib.agi_limit_percentage}% AGI Limit Applies`);
    }

    // Add carryforward note if applicable
    if (contrib.carryforward_eligible) {
      lines.push(`MCarryforward Eligible`);
    }

    // Entry footer
    lines.push('^');
  }

  return lines.join('\n');
}

/**
 * Generate CSV file content for spreadsheet analysis
 */
export function generateCSV(
  contributions: TaxContributionExport[],
  taxYear: number
): string {
  const headers = [
    'Date',
    'Recipient Name',
    'Recipient EIN',
    'Contribution Type',
    'Amount',
    'FMV at Donation',
    'Cost Basis',
    'Capital Gain',
    'Deductible Amount',
    'AGI Limit %',
    'Carryforward Eligible',
    'QCD',
    'Requires Appraisal',
    'Appraisal Value',
    'Property Description',
    'Notes',
  ];

  const rows: string[][] = [];
  rows.push(headers);

  for (const contrib of contributions) {
    const capitalGain = contrib.fmv_at_donation && contrib.cost_basis
      ? contrib.fmv_at_donation - contrib.cost_basis
      : null;

    rows.push([
      contrib.contribution_date,
      contrib.recipient_name,
      contrib.recipient_ein || '',
      contrib.contribution_type,
      contrib.amount_usd.toFixed(2),
      contrib.fmv_at_donation?.toFixed(2) || '',
      contrib.cost_basis?.toFixed(2) || '',
      capitalGain?.toFixed(2) || '',
      (contrib.deductible_amount ?? contrib.amount_usd).toFixed(2),
      contrib.agi_limit_percentage?.toString() || '',
      contrib.carryforward_eligible ? 'Yes' : 'No',
      contrib.qcd_qualified ? 'Yes' : 'No',
      contrib.requires_appraisal ? 'Yes' : 'No',
      contrib.appraisal_value?.toFixed(2) || '',
      contrib.property_description || '',
      contrib.notes || '',
    ]);
  }

  // Convert to CSV format (quote fields with commas)
  return rows
    .map(row =>
      row
        .map(cell => {
          const cellStr = String(cell);
          return cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')
            ? `"${cellStr.replace(/"/g, '""')}"`
            : cellStr;
        })
        .join(',')
    )
    .join('\n');
}

/**
 * Generate Form 8283 summary (for non-cash contributions > $500)
 */
export function generateForm8283Summary(
  contributions: TaxContributionExport[],
  taxYear: number
): string {
  const lines: string[] = [];

  lines.push(`FORM 8283 SUMMARY - ${taxYear}`);
  lines.push('Noncash Charitable Contributions');
  lines.push('');
  lines.push('SECTION A: Donated Property of $5,000 or Less and Publicly Traded Securities');
  lines.push('');

  const sectionAContribs = contributions.filter(c => {
    const isCash = ['cash', 'check', 'wire'].includes(c.contribution_type);
    const amount = c.fmv_at_donation ?? c.amount_usd;
    return !isCash && amount <= 5000;
  });

  if (sectionAContribs.length > 0) {
    lines.push('Property Description | Recipient | Date | FMV | Cost Basis | Gain');
    lines.push('-'.repeat(80));

    for (const contrib of sectionAContribs) {
      const fmv = contrib.fmv_at_donation ?? contrib.amount_usd;
      const costBasis = contrib.cost_basis ?? 0;
      const gain = fmv - costBasis;

      lines.push(
        `${contrib.property_description || contrib.contribution_type} | ` +
        `${contrib.recipient_name} | ` +
        `${contrib.contribution_date} | ` +
        `$${fmv.toFixed(2)} | ` +
        `$${costBasis.toFixed(2)} | ` +
        `$${gain.toFixed(2)}`
      );
    }

    const totalFMV = sectionAContribs.reduce((sum, c) => sum + (c.fmv_at_donation ?? c.amount_usd), 0);
    lines.push('-'.repeat(80));
    lines.push(`Total Section A: $${totalFMV.toFixed(2)}`);
  } else {
    lines.push('No Section A contributions');
  }

  lines.push('');
  lines.push('SECTION B: Donated Property Over $5,000 (Requires Qualified Appraisal)');
  lines.push('');

  const sectionBContribs = contributions.filter(c => {
    const isCash = ['cash', 'check', 'wire'].includes(c.contribution_type);
    const amount = c.fmv_at_donation ?? c.amount_usd;
    return !isCash && amount > 5000;
  });

  if (sectionBContribs.length > 0) {
    lines.push('Property Description | Recipient | Date | Appraised Value | Cost Basis | Gain | Appraisal Date');
    lines.push('-'.repeat(100));

    for (const contrib of sectionBContribs) {
      const fmv = contrib.appraisal_value ?? contrib.fmv_at_donation ?? contrib.amount_usd;
      const costBasis = contrib.cost_basis ?? 0;
      const gain = fmv - costBasis;

      lines.push(
        `${contrib.property_description || contrib.contribution_type} | ` +
        `${contrib.recipient_name} | ` +
        `${contrib.contribution_date} | ` +
        `$${fmv.toFixed(2)} | ` +
        `$${costBasis.toFixed(2)} | ` +
        `$${gain.toFixed(2)} | ` +
        `${contrib.requires_appraisal ? 'Required' : 'N/A'}`
      );
    }

    const totalFMV = sectionBContribs.reduce((sum, c) => sum + (c.appraisal_value ?? c.fmv_at_donation ?? c.amount_usd), 0);
    lines.push('-'.repeat(100));
    lines.push(`Total Section B: $${totalFMV.toFixed(2)}`);
    lines.push('');
    lines.push('⚠️  REMINDER: Section B contributions require a qualified appraisal and appraiser declaration.');
  } else {
    lines.push('No Section B contributions');
  }

  lines.push('');
  lines.push('QCD CONTRIBUTIONS (Not deducted on Schedule A - Excluded from income)');
  lines.push('');

  const qcdContribs = contributions.filter(c => c.qcd_qualified === true);

  if (qcdContribs.length > 0) {
    lines.push('Recipient | Date | Amount');
    lines.push('-'.repeat(60));

    for (const contrib of qcdContribs) {
      lines.push(
        `${contrib.recipient_name} | ` +
        `${contrib.contribution_date} | ` +
        `$${contrib.amount_usd.toFixed(2)}`
      );
    }

    const totalQCD = qcdContribs.reduce((sum, c) => sum + c.amount_usd, 0);
    lines.push('-'.repeat(60));
    lines.push(`Total QCD: $${totalQCD.toFixed(2)}`);
    lines.push('');
    const qcdLimit = getQCDLimit(taxYear);
    lines.push(`ℹ️  QCDs count toward RMD and are excluded from income. ${taxYear} limit: $${qcdLimit.toLocaleString()}/year per person.`);
  } else {
    lines.push('No QCD contributions');
  }

  return lines.join('\n');
}

/**
 * Generate carryforward schedule report
 */
export function generateCarryforwardReport(
  contributions: TaxContributionExport[],
  taxYear: number
): string {
  const lines: string[] = [];

  lines.push(`CHARITABLE CONTRIBUTION CARRYFORWARD SCHEDULE - ${taxYear}`);
  lines.push('');

  const carryforwardContribs = contributions.filter(c => c.carryforward_eligible === true);

  if (carryforwardContribs.length === 0) {
    lines.push('No contributions require carryforward.');
    return lines.join('\n');
  }

  lines.push('The following contributions exceeded AGI limits and are eligible for carryforward:');
  lines.push('');
  lines.push('Recipient | Date | Amount | AGI Limit % | Carryforward Period');
  lines.push('-'.repeat(90));

  for (const contrib of carryforwardContribs) {
    const period = contrib.contribution_type === 'conservation_easement' ? '15 years' : '5 years';

    lines.push(
      `${contrib.recipient_name} | ` +
      `${contrib.contribution_date} | ` +
      `$${contrib.amount_usd.toFixed(2)} | ` +
      `${contrib.agi_limit_percentage}% | ` +
      `${period}`
    );
  }

  lines.push('');
  lines.push('CARRYFORWARD USAGE SCHEDULE:');
  lines.push('');
  lines.push(`Year ${taxYear + 1}: Available for deduction (subject to AGI limits)`);
  lines.push(`Year ${taxYear + 2}: Available for deduction (subject to AGI limits)`);
  lines.push(`Year ${taxYear + 3}: Available for deduction (subject to AGI limits)`);
  lines.push(`Year ${taxYear + 4}: Available for deduction (subject to AGI limits)`);
  lines.push(`Year ${taxYear + 5}: Final year for most contributions`);
  lines.push('');
  lines.push('ℹ️  Conservation easements can be carried forward for 15 years.');
  lines.push('ℹ️  Unused carryforwards after the carryforward period expire and cannot be deducted.');

  return lines.join('\n');
}
