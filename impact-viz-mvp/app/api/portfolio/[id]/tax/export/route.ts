import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';
import * as XLSX from 'xlsx';
import {
  CONTRIBUTION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
  FILING_STATUS_LABELS,
  TAX_DISCLAIMER,
} from '@/lib/tax/constants';

/**
 * GET /api/portfolio/[id]/tax/export?year=2024&format=json|csv|xlsx
 * Export tax data in various formats
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());
  const format = url.searchParams.get('format') || 'json';

  const sb = await supabasePublic();

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
      .from('v_active_carryforwards')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .lte('originating_tax_year', year),
    sb
      .from('portfolios')
      .select('name')
      .eq('id', portfolioId)
      .single(),
  ]);

  // Check if user has access (RLS will return null if no access)
  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found or access denied' }, { status: 403 });
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
  const totalCarryforward = (carryforwards || []).reduce(
    (sum, c) => sum + (c.amount_remaining || 0),
    0
  );

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
    contributions: (contributions || []).map((c) => ({
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
      acknowledgmentReceived: c.acknowledgment_received ? 'Yes' : 'No',
      isCompliant: c.is_compliant ? 'Yes' : 'No',
      substantiationRequired: c.substantiation_requirement,
      notes: c.notes || '',
    })),
    carryforwards: (carryforwards || []).map((cf) => ({
      originatingYear: cf.originating_tax_year,
      expiresYear: cf.expires_tax_year,
      category: cf.agi_limit_category,
      originalAmount: cf.amount,
      remainingAmount: cf.amount_remaining,
      recipient: cf.recipient_name || '',
    })),
  };

  // Return based on format
  if (format === 'json') {
    return NextResponse.json({ data: exportData });
  }

  if (format === 'csv') {
    const csv = generateCSV(exportData);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="tax-summary-${year}.csv"`,
      },
    });
  }

  if (format === 'xlsx') {
    const buffer = generateXLSX(exportData);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="tax-summary-${year}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
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

  // Contributions table
  lines.push('CONTRIBUTIONS');
  lines.push('Date,Recipient,EIN,Type,Amount,Deductible,Acknowledgment,Compliant,Notes');
  for (const c of data.contributions) {
    lines.push(
      [
        c.date,
        `"${c.recipient.replace(/"/g, '""')}"`,
        c.recipientEIN,
        c.type,
        c.amount,
        c.deductibleAmount,
        c.acknowledgmentReceived,
        c.isCompliant,
        `"${(c.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    );
  }
  lines.push('');

  // Carryforwards table
  if (data.carryforwards.length > 0) {
    lines.push('CARRYFORWARDS');
    lines.push('Originating Year,Expires Year,Category,Original Amount,Remaining Amount');
    for (const cf of data.carryforwards) {
      lines.push(
        [
          cf.originatingYear,
          cf.expiresYear,
          cf.category,
          cf.originalAmount,
          cf.remainingAmount,
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

  // Contributions sheet
  const contributionsHeader = [
    'Date',
    'Recipient',
    'EIN',
    'Recipient Type',
    'Contribution Type',
    'Amount',
    'Deductible Amount',
    'FMV',
    'Cost Basis',
    'Acknowledgment',
    'Compliant',
    'Substantiation Required',
    'Notes',
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
      c.fmv || '',
      c.costBasis || '',
      c.acknowledgmentReceived,
      c.isCompliant,
      c.substantiationRequired,
      c.notes,
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
