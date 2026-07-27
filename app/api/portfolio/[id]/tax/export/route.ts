import { NextResponse } from 'next/server';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import * as XLSX from 'xlsx';
import {
  CONTRIBUTION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
  FILING_STATUS_LABELS,
  TAX_DISCLAIMER,
} from '@/lib/tax/constants';
import {
  generateTXF,
  generateForm8283Summary,
  generateCarryforwardReport,
  type TaxContributionExport,
} from '@/lib/tax/turbotax-export';

function noStoreHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    'Cache-Control': 'no-store',
  };
}

/**
 * GET /api/portfolio/[id]/tax/export?year=2024&format=json|csv|xlsx|txf|form8283
 * Export tax data in various formats
 *
 * Formats:
 * - json: Structured data for API consumption
 * - csv: Spreadsheet-compatible format
 * - xlsx: Excel workbook with multiple sheets
 * - txf: TurboTax/TaxAct import file (Tax Exchange Format)
 * - form8283: Form 8283 summary for non-cash contributions
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId);
  if (isAccessDenied(access)) return access.response;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());
  const format = url.searchParams.get('format') || 'json';

  const sb = access.context.db;

  // Fetch all required data (RLS will enforce permissions)
  const [
    { data: profile },
    { data: contributions },
    { data: carryforwards },
    { data: portfolio },
  ] = await Promise.all([
    sb
      .from('tax_profiles')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .single(),
    sb
      .from('v_tax_contributions_enriched')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: true }),
    sb
      .from('tax_carryforwards')
      .select('*, tax_carryforward_applications(applied_tax_year, amount_applied, amount_remaining_after)')
      .eq('portfolio_id', portfolioId)
      .lte('originating_tax_year', year)
      .gte('expires_tax_year', year)
      .order('expires_tax_year', { ascending: true }),
    sb
      .from('portfolios')
      .select('name')
      .eq('id', portfolioId)
      .single(),
  ]);

  // Check if user has access (RLS will return null if no access)
  if (!portfolio) {
    return jsonError('Portfolio not found or access denied', 403);
  }

  // Calculate summary statistics
  const totalContributions = (contributions || []).reduce(
    (sum, c) => sum + (c.amount_usd || 0),
    0
  );
  const totalDeductible = (contributions || []).reduce(
    (sum, c) => sum + (c.calculated_deductible_amount || c.amount_usd || 0),
    0
  );
  const cashContributions = (contributions || [])
    .filter((c) => ['cash', 'check', 'wire'].includes(c.contribution_type))
    .reduce((sum, c) => sum + (c.amount_usd || 0), 0);
  const nonCashContributions = totalContributions - cashContributions;
  const compliantCount = (contributions || []).filter((c) => c.is_compliant).length;
  const carryforwardsAsOfYear = (carryforwards || []).map((cf: any) => {
    const applicationsThroughYear = (cf.tax_carryforward_applications || [])
      .filter((app: any) => app.applied_tax_year <= year)
      .reduce((sum: number, app: any) => sum + Number(app.amount_applied || 0), 0);
    const remainingAmount = Math.max(0, Number(cf.amount || 0) - applicationsThroughYear);
    return {
      ...cf,
      amount_remaining: remainingAmount,
      applications_through_year: applicationsThroughYear,
    };
  }).filter((cf: any) => cf.amount_remaining > 0);

  const totalCarryforward = carryforwardsAsOfYear.reduce(
    (sum, c) => sum + (c.amount_remaining || 0),
    0
  );

  // Sort contributions: non-cash first (CPAs review these first), then cash;
  // within each group sort by amount descending.
  const isCashType = (type: string) => ['cash', 'check', 'wire'].includes(type);
  const sortedContributions = [...(contributions || [])].sort((a, b) => {
    const aCash = isCashType(a.contribution_type) ? 1 : 0;
    const bCash = isCashType(b.contribution_type) ? 1 : 0;
    if (aCash !== bCash) return aCash - bCash; // non-cash first
    return (b.amount_usd || 0) - (a.amount_usd || 0); // amount desc within group
  });

  // Build export data structure
  const exportData = {
    meta: {
      portfolioName: portfolio?.name || 'Unknown Portfolio',
      taxYear: year,
      generatedAt: new Date().toISOString(),
      disclaimer: TAX_DISCLAIMER,
    },
    profile: profile
      ? {
          filingStatus: profile.filing_status
            ? FILING_STATUS_LABELS[profile.filing_status as keyof typeof FILING_STATUS_LABELS]
            : 'Not specified',
          estimatedAGI: profile.estimated_agi,
          carryforwardFromPrior: profile.carryforward_from_prior,
        }
      : null,
    summary: {
      totalContributions,
      totalDeductible,
      cashContributions,
      nonCashContributions,
      contributionCount: (contributions || []).length,
      compliantCount,
      complianceRate:
        (contributions || []).length > 0
          ? Math.round((compliantCount / (contributions || []).length) * 100)
          : null,
      totalCarryforwardAvailable: totalCarryforward,
    },
    contributions: sortedContributions.map((c) => ({
      date: c.contribution_date,
      recipient: c.recipient_name,
      recipientEIN: c.recipient_ein || '',
      recipientType: c.recipient_type
        ? RECIPIENT_TYPE_LABELS[c.recipient_type as keyof typeof RECIPIENT_TYPE_LABELS]
        : '',
      type: CONTRIBUTION_TYPE_LABELS[c.contribution_type as keyof typeof CONTRIBUTION_TYPE_LABELS],
      amount: c.amount_usd,
      deductibleAmount: c.calculated_deductible_amount || c.amount_usd,
      fmv: c.fmv_at_donation,
      costBasis: c.cost_basis,
      propertyDescription: c.property_description || '',
      qcdQualified: c.qcd_qualified ? 'Yes' : 'No',
      substantiationStatus: c.substantiation_status || '',
      acknowledgmentReceived: c.acknowledgment_received ? 'Yes' : 'No',
      isCompliant: c.is_compliant ? 'Yes' : 'No',
      substantiationRequired: c.substantiation_requirement,
      appraisalPresent: c.appraisal_storage_path ? 'Yes' : 'No',
    })),
    carryforwards: carryforwardsAsOfYear.map((cf) => ({
      originatingYear: cf.originating_tax_year,
      expiresYear: cf.expires_tax_year,
      category: cf.agi_limit_category,
      originalAmount: cf.amount,
      remainingAmount: cf.amount_remaining,
      appliedThroughTaxYear: cf.applications_through_year,
      recipient: cf.recipient_name || '',
    })),
  };

  // Return based on format
  if (format === 'json') {
    return jsonOk({ data: exportData });
  }

  if (format === 'csv') {
    const csv = generateCSV(exportData);
    return new NextResponse(csv, {
      headers: noStoreHeaders({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="tax-summary-${year}.csv"`,
      }),
    });
  }

  if (format === 'xlsx') {
    const buffer = generateXLSX(exportData);
    return new NextResponse(buffer, {
      headers: noStoreHeaders({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="tax-summary-${year}.xlsx"`,
      }),
    });
  }

  if (format === 'txf') {
    // Fetch from Phase 1 views for TXF export
    const { data: phase1Contributions } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: true });

    const txfContributions: TaxContributionExport[] = (phase1Contributions || []).map((c: any) => ({
      id: c.id,
      contribution_date: c.contribution_date,
      recipient_name: c.recipient_name,
      recipient_ein: c.recipient_ein,
      recipient_type: c.recipient_type,
      contribution_type: c.contribution_type,
      amount_usd: c.amount_usd,
      fmv_at_donation: c.fmv_at_donation,
      cost_basis: c.cost_basis,
      property_description: c.property_description,
      deductible_amount: c.deductible_this_year ?? c.original_deductible_amount,
      agi_limit_percentage: c.agi_limit_percentage,
      carryforward_eligible: c.carryforward_eligible,
      qcd_qualified: c.qcd_qualified ?? false,
      requires_appraisal: c.requires_appraisal ?? false,
      appraisal_value: c.appraisal_value ?? null,
      notes: c.notes,
    }));

    const txf = generateTXF(txfContributions, year, portfolio?.name || 'Taxpayer');
    return new NextResponse(txf, {
      headers: noStoreHeaders({
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="turbotax-import-${year}.txf"`,
      }),
    });
  }

  if (format === 'form8283') {
    // Fetch from Phase 1 views for Form 8283
    const { data: phase1Contributions } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .order('contribution_date', { ascending: true });

    const form8283Contributions: TaxContributionExport[] = (phase1Contributions || []).map((c: any) => ({
      id: c.id,
      contribution_date: c.contribution_date,
      recipient_name: c.recipient_name,
      recipient_ein: c.recipient_ein,
      recipient_type: c.recipient_type,
      contribution_type: c.contribution_type,
      amount_usd: c.amount_usd,
      fmv_at_donation: c.fmv_at_donation,
      cost_basis: c.cost_basis,
      property_description: c.property_description,
      deductible_amount: c.deductible_this_year ?? c.original_deductible_amount,
      agi_limit_percentage: c.agi_limit_percentage,
      carryforward_eligible: c.carryforward_eligible,
      qcd_qualified: c.qcd_qualified ?? false,
      requires_appraisal: c.requires_appraisal ?? false,
      appraisal_value: c.appraisal_value ?? null,
      notes: c.notes,
    }));

    const form8283 = generateForm8283Summary(form8283Contributions, year);
    return new NextResponse(form8283, {
      headers: noStoreHeaders({
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="form-8283-summary-${year}.txt"`,
      }),
    });
  }

  if (format === 'pdf') {
    const { generateTaxReportPDF } = await import('@/lib/pdf/tax-report-generator');
    const buffer = generateTaxReportPDF({
      portfolioName: portfolio?.name || 'Portfolio',
      taxYear: year,
      generatedAt: new Date().toISOString(),
      summary: {
        totalContributions,
        totalDeductible,
        cashContributions,
        nonCashContributions,
        contributionCount: (contributions || []).length,
        complianceRate: exportData.summary.complianceRate,
        totalCarryforwardAvailable: totalCarryforward,
      },
      profile: exportData.profile,
      contributions: exportData.contributions,
      carryforwards: exportData.carryforwards,
    });

    return new NextResponse(buffer, {
      headers: noStoreHeaders({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="tax-summary-${year}.pdf"`,
      }),
    });
  }

  if (format === 'carryforward') {
    // Generate carryforward report
    const { data: phase1Contributions } = await sb
      .from('v_tax_contributions_with_limits')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', year)
      .eq('carryforward_eligible', true)
      .order('contribution_date', { ascending: true });

    const carryforwardContributions: TaxContributionExport[] = (phase1Contributions || []).map((c: any) => ({
      id: c.id,
      contribution_date: c.contribution_date,
      recipient_name: c.recipient_name,
      recipient_ein: c.recipient_ein,
      recipient_type: c.recipient_type,
      contribution_type: c.contribution_type,
      amount_usd: c.amount_usd,
      fmv_at_donation: c.fmv_at_donation,
      cost_basis: c.cost_basis,
      property_description: c.property_description,
      deductible_amount: c.deductible_this_year ?? c.original_deductible_amount,
      agi_limit_percentage: c.agi_limit_percentage,
      carryforward_eligible: c.carryforward_eligible,
      qcd_qualified: c.qcd_qualified ?? false,
      requires_appraisal: c.requires_appraisal ?? false,
      appraisal_value: c.appraisal_value ?? null,
      substantiation_status: c.substantiation_status,
      notes: c.notes,
    }));

    const carryforwardReport = generateCarryforwardReport(carryforwardContributions, year);
    return new NextResponse(carryforwardReport, {
      headers: noStoreHeaders({
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="carryforward-schedule-${year}.txt"`,
      }),
    });
  }

  return jsonError('Invalid format', 400);
}

function csvCell(value: any): string {
  const s = String(value ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function generateCSV(data: any): string {
  const lines: string[] = [];

  // Header info
  lines.push(`Tax Summary Report - ${data.meta.taxYear}`);
  lines.push(`Portfolio: ${data.meta.portfolioName}`);
  lines.push(`Generated: ${new Date(data.meta.generatedAt).toLocaleString()}`);
  lines.push('');

  // Summary section
  lines.push('SUMMARY');
  lines.push(`Total Contributions,$${data.summary.totalContributions.toLocaleString()}`);
  lines.push(`Total Deductible,$${data.summary.totalDeductible.toLocaleString()}`);
  lines.push(`Cash Contributions,$${data.summary.cashContributions.toLocaleString()}`);
  lines.push(`Non-Cash Contributions,$${data.summary.nonCashContributions.toLocaleString()}`);
  lines.push(`Number of Contributions,${data.summary.contributionCount}`);
  lines.push(`Compliance Rate,${data.summary.complianceRate}%`);
  if (data.summary.totalCarryforwardAvailable > 0) {
    lines.push(`Carryforward Available,$${data.summary.totalCarryforwardAvailable.toLocaleString()}`);
  }
  lines.push('');

  // Contributions table — non-cash appear first (already sorted), then cash
  lines.push('CONTRIBUTIONS');
  lines.push(
    'Date,Recipient,EIN,Recipient Type,Contribution Type,Amount,Deductible Amount,' +
    'FMV at Donation,Cost Basis,Property Description,QCD,Substantiation Status,' +
    'Acknowledgment Received,Appraisal Present,Compliant,Substantiation Required'
  );
  for (const c of data.contributions) {
    lines.push(
      [
        csvCell(c.date),
        csvCell(c.recipient),
        csvCell(c.recipientEIN),
        csvCell(c.recipientType),
        csvCell(c.type),
        csvCell(c.amount),
        csvCell(c.deductibleAmount),
        csvCell(c.fmv ?? ''),
        csvCell(c.costBasis ?? ''),
        csvCell(c.propertyDescription),
        csvCell(c.qcdQualified),
        csvCell(c.substantiationStatus),
        csvCell(c.acknowledgmentReceived),
        csvCell(c.appraisalPresent),
        csvCell(c.isCompliant),
        csvCell(c.substantiationRequired),
      ].join(',')
    );
  }
  lines.push('');

  // Carryforwards table
  if (data.carryforwards.length > 0) {
    lines.push('CARRYFORWARDS');
    lines.push('Originating Year,Expires Year,Category,Original Amount,Remaining Amount,Recipient');
    for (const cf of data.carryforwards) {
      lines.push(
        [
          csvCell(cf.originatingYear),
          csvCell(cf.expiresYear),
          csvCell(cf.category),
          csvCell(cf.originalAmount),
          csvCell(cf.remainingAmount),
          csvCell(cf.recipient),
        ].join(',')
      );
    }
    lines.push('');
  }

  // Disclaimer
  lines.push('DISCLAIMER');
  lines.push(`"${data.meta.disclaimer.replace(/"/g, '""').replace(/\n/g, ' ')}"`);

  return lines.join('\n');
}

function generateXLSX(data: any): Buffer {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Tax Summary Report', data.meta.taxYear],
    ['Portfolio', data.meta.portfolioName],
    ['Generated', new Date(data.meta.generatedAt).toLocaleString()],
    [],
    ['SUMMARY'],
    ['Total Contributions', data.summary.totalContributions],
    ['Total Deductible', data.summary.totalDeductible],
    ['Cash Contributions', data.summary.cashContributions],
    ['Non-Cash Contributions', data.summary.nonCashContributions],
    ['Number of Contributions', data.summary.contributionCount],
    ['Compliance Rate', `${data.summary.complianceRate}%`],
    ['Carryforward Available', data.summary.totalCarryforwardAvailable],
  ];

  if (data.profile) {
    summaryData.push([]);
    summaryData.push(['TAX PROFILE']);
    summaryData.push(['Filing Status', data.profile.filingStatus]);
    summaryData.push(['Estimated AGI', data.profile.estimatedAGI || 'Not provided']);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Contributions sheet — non-cash first (already sorted), then cash
  const contributionsHeader = [
    'Date',
    'Recipient',
    'EIN',
    'Recipient Type',
    'Contribution Type',
    'Amount',
    'Deductible Amount',
    'FMV at Donation',
    'Cost Basis',
    'Property Description',
    'QCD',
    'Substantiation Status',
    'Acknowledgment Received',
    'Appraisal Present',
    'Compliant',
    'Substantiation Required',
  ];
  const contributionsData = [
    contributionsHeader,
    ...data.contributions.map((c: any) => [
      c.date,
      c.recipient,
      c.recipientEIN,
      c.recipientType,
      c.type,
      c.amount,
      c.deductibleAmount,
      c.fmv ?? '',
      c.costBasis ?? '',
      c.propertyDescription,
      c.qcdQualified,
      c.substantiationStatus,
      c.acknowledgmentReceived,
      c.appraisalPresent,
      c.isCompliant,
      c.substantiationRequired,
    ]),
  ];
  const contributionsSheet = XLSX.utils.aoa_to_sheet(contributionsData);
  XLSX.utils.book_append_sheet(wb, contributionsSheet, 'Contributions');

  // Carryforwards sheet (if any)
  if (data.carryforwards.length > 0) {
    const carryforwardsHeader = [
      'Originating Year',
      'Expires Year',
      'AGI Category',
      'Original Amount',
      'Remaining Amount',
      'Recipient',
    ];
    const carryforwardsData = [
      carryforwardsHeader,
      ...data.carryforwards.map((cf: any) => [
        cf.originatingYear,
        cf.expiresYear,
        cf.category,
        cf.originalAmount,
        cf.remainingAmount,
        cf.recipient,
      ]),
    ];
    const carryforwardsSheet = XLSX.utils.aoa_to_sheet(carryforwardsData);
    XLSX.utils.book_append_sheet(wb, carryforwardsSheet, 'Carryforwards');
  }

  // Disclaimer sheet
  const disclaimerSheet = XLSX.utils.aoa_to_sheet([
    ['IMPORTANT DISCLAIMER'],
    [],
    [data.meta.disclaimer],
  ]);
  XLSX.utils.book_append_sheet(wb, disclaimerSheet, 'Disclaimer');

  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}
