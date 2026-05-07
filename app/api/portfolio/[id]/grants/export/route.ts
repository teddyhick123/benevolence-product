import { NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import * as XLSX from 'xlsx';

/**
 * GET /api/portfolio/[id]/grants/export?format=csv|json|xlsx&grantId=optional
 * Export grant data for a portfolio (or single grant)
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';
  const grantId = url.searchParams.get('grantId') || null;

  // Auth check
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const sb = createAdminClient();

  // Fetch portfolio info
  const { data: portfolio } = await sb
    .from('portfolios')
    .select('name')
    .eq('id', portfolioId)
    .single();

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found' }, { status: 404 });
  }

  // Build grant query
  let grantsQuery = sb.from('v_grants').select('*').eq('portfolio_id', portfolioId);
  if (grantId) grantsQuery = grantsQuery.eq('grant_id', grantId);
  const { data: grants } = await grantsQuery;

  const grantIds = (grants || []).map((g: any) => g.grant_id).filter(Boolean);

  // Fetch related data in parallel
  const [
    { data: milestones },
    { data: payments },
    { data: communications },
    { data: budgetItems },
  ] = await Promise.all([
    grantIds.length > 0
      ? sb.from('grant_milestones').select('*').in('grant_id', grantIds).order('due_date')
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_payments').select('*').in('grant_id', grantIds).order('scheduled_date')
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_communications').select('*').in('grant_id', grantIds).order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_budget_items').select('*').in('grant_id', grantIds).order('category')
      : Promise.resolve({ data: [] }),
  ]);

  const exportData = {
    meta: {
      portfolioName: portfolio.name,
      generatedAt: new Date().toISOString(),
      grantCount: (grants || []).length,
    },
    grants: (grants || []).map((g: any) => ({
      id: g.grant_id,
      name: g.name,
      grant_type: g.grant_type,
      status: g.status,
      funds_allocated: g.funds_allocated,
      grant_period_start: g.grant_period_start,
      grant_period_end: g.grant_period_end,
      reporting_frequency: g.reporting_frequency,
      next_report_due: g.next_report_due,
      renewal_eligible: g.renewal_eligible,
      sector: g.sector,
      country: g.country,
    })),
    milestones: (milestones || []).map((m: any) => ({
      grant_id: m.grant_id,
      milestone_name: m.milestone_name,
      description: m.description,
      due_date: m.due_date,
      completed_date: m.completed_date,
      status: m.status,
      notes: m.notes,
    })),
    payments: (payments || []).map((p: any) => ({
      grant_id: p.grant_id,
      payment_type: p.payment_type,
      amount: p.amount,
      scheduled_date: p.scheduled_date,
      paid_date: p.paid_date,
      status: p.status,
      notes: p.notes,
    })),
    budget_items: (budgetItems || []).map((b: any) => ({
      grant_id: b.grant_id,
      category: b.category,
      description: b.description,
      budgeted_amount: b.budgeted_amount,
      actual_amount: b.actual_amount,
      variance: b.actual_amount != null ? b.budgeted_amount - b.actual_amount : null,
    })),
  };

  const dateStr = new Date().toISOString().split('T')[0];

  if (format === 'json') {
    return NextResponse.json({ data: exportData });
  }

  if (format === 'csv') {
    const csv = generateCSV(exportData);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="grants-export-${dateStr}.csv"`,
      },
    });
  }

  if (format === 'xlsx') {
    const buffer = generateXLSX(exportData);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="grants-export-${dateStr}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid format. Use csv, json, or xlsx.' }, { status: 400 });
}

function generateCSV(data: ReturnType<typeof buildExportData>): string {
  const lines: string[] = [];

  lines.push(`Grant Export Report`);
  lines.push(`Portfolio: ${data.meta.portfolioName}`);
  lines.push(`Generated: ${new Date(data.meta.generatedAt).toLocaleString()}`);
  lines.push(`Total Grants: ${data.meta.grantCount}`);
  lines.push('');

  lines.push('GRANTS');
  lines.push('Name,Type,Status,Funds Allocated,Period Start,Period End,Reporting Frequency,Next Report Due,Renewal Eligible,Sector,Country');
  for (const g of data.grants) {
    lines.push([
      `"${(g.name || '').replace(/"/g, '""')}"`,
      g.grant_type || '',
      g.status || '',
      g.funds_allocated || 0,
      g.grant_period_start || '',
      g.grant_period_end || '',
      g.reporting_frequency || '',
      g.next_report_due || '',
      g.renewal_eligible ? 'Yes' : 'No',
      `"${(g.sector || '').replace(/"/g, '""')}"`,
      g.country || '',
    ].join(','));
  }
  lines.push('');

  if (data.milestones.length > 0) {
    lines.push('MILESTONES');
    lines.push('Grant ID,Name,Description,Due Date,Completed Date,Status,Notes');
    for (const m of data.milestones) {
      lines.push([
        m.grant_id,
        `"${(m.milestone_name || '').replace(/"/g, '""')}"`,
        `"${(m.description || '').replace(/"/g, '""')}"`,
        m.due_date || '',
        m.completed_date || '',
        m.status || '',
        `"${(m.notes || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    lines.push('');
  }

  if (data.payments.length > 0) {
    lines.push('PAYMENTS');
    lines.push('Grant ID,Payment Type,Amount,Scheduled Date,Paid Date,Status,Notes');
    for (const p of data.payments) {
      lines.push([
        p.grant_id,
        p.payment_type || '',
        p.amount || 0,
        p.scheduled_date || '',
        p.paid_date || '',
        p.status || '',
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    lines.push('');
  }

  if (data.budget_items.length > 0) {
    lines.push('BUDGET ITEMS');
    lines.push('Grant ID,Category,Description,Budgeted,Actual,Variance');
    for (const b of data.budget_items) {
      lines.push([
        b.grant_id,
        `"${(b.category || '').replace(/"/g, '""')}"`,
        `"${(b.description || '').replace(/"/g, '""')}"`,
        b.budgeted_amount || 0,
        b.actual_amount != null ? b.actual_amount : '',
        b.variance != null ? b.variance : '',
      ].join(','));
    }
  }

  return lines.join('\n');
}

function generateXLSX(data: ReturnType<typeof buildExportData>): Buffer {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Grant Export Report'],
    ['Portfolio', data.meta.portfolioName],
    ['Generated', new Date(data.meta.generatedAt).toLocaleString()],
    ['Total Grants', data.meta.grantCount],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

  // Grants sheet
  const grantsHeader = ['Name', 'Type', 'Status', 'Funds Allocated', 'Period Start', 'Period End', 'Reporting Freq', 'Next Report Due', 'Renewal Eligible', 'Sector', 'Country'];
  const grantsData = [
    grantsHeader,
    ...data.grants.map((g: any) => [
      g.name, g.grant_type, g.status, g.funds_allocated,
      g.grant_period_start, g.grant_period_end, g.reporting_frequency,
      g.next_report_due, g.renewal_eligible ? 'Yes' : 'No', g.sector, g.country,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grantsData), 'Grants');

  // Milestones sheet
  if (data.milestones.length > 0) {
    const milestonesHeader = ['Grant ID', 'Milestone', 'Description', 'Due Date', 'Completed Date', 'Status', 'Notes'];
    const milestonesData = [
      milestonesHeader,
      ...data.milestones.map((m: any) => [m.grant_id, m.milestone_name, m.description, m.due_date, m.completed_date, m.status, m.notes]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(milestonesData), 'Milestones');
  }

  // Payments sheet
  if (data.payments.length > 0) {
    const paymentsHeader = ['Grant ID', 'Payment Type', 'Amount', 'Scheduled Date', 'Paid Date', 'Status', 'Notes'];
    const paymentsData = [
      paymentsHeader,
      ...data.payments.map((p: any) => [p.grant_id, p.payment_type, p.amount, p.scheduled_date, p.paid_date, p.status, p.notes]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(paymentsData), 'Payments');
  }

  // Budget sheet
  if (data.budget_items.length > 0) {
    const budgetHeader = ['Grant ID', 'Category', 'Description', 'Budgeted', 'Actual', 'Variance'];
    const budgetData = [
      budgetHeader,
      ...data.budget_items.map((b: any) => [b.grant_id, b.category, b.description, b.budgeted_amount, b.actual_amount, b.variance]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(budgetData), 'Budget');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Type helper used above
function buildExportData(d: any) { return d; }
