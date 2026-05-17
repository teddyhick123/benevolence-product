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
    { data: decisions },
  ] = await Promise.all([
    grantIds.length > 0
      ? sb.from('grant_milestones').select('grant_id, milestone_name, description, due_date, completed_date, status, notes').in('grant_id', grantIds).order('due_date')
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_payments').select('grant_id, payment_number, payment_type, amount, scheduled_date, paid_date, status, conditions_met, notes').in('grant_id', grantIds).order('scheduled_date')
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_communications').select('grant_id, direction, comm_type, subject, summary, contact_name, occurred_at').in('grant_id', grantIds).order('occurred_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_budget_items').select('grant_id, category, description, budgeted_amount, actual_amount').in('grant_id', grantIds).order('category')
      : Promise.resolve({ data: [] }),
    grantIds.length > 0
      ? sb.from('grant_decisions').select('grant_id, decision_type, decision, decision_date, decided_by, amount, conditions, rationale').in('grant_id', grantIds).order('decision_date', { ascending: false })
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
      lifecycle_stage: g.lifecycle_stage,
      risk_level: g.risk_level,
      owner_id: g.internal_owner_id,
      requested_amount: g.requested_amount,
      approved_amount: g.approved_amount,
      funds_allocated: g.funds_allocated,
      currency: g.currency,
      grant_period_start: g.grant_period_start,
      grant_period_end: g.grant_period_end,
      reporting_frequency: g.reporting_frequency,
      next_report_due: g.next_report_due,
      renewal_eligible: g.renewal_eligible,
      purpose: g.purpose,
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
      payment_number: p.payment_number,
      payment_type: p.payment_type,
      amount: p.amount,
      scheduled_date: p.scheduled_date,
      paid_date: p.paid_date,
      status: p.status,
      conditions_met: p.conditions_met,
      notes: p.notes,
    })),
    decisions: (decisions || []).map((d: any) => ({
      grant_id: d.grant_id,
      decision_type: d.decision_type,
      decision: d.decision,
      decision_date: d.decision_date,
      decided_by: d.decided_by,
      amount: d.amount,
      conditions: d.conditions,
      rationale: d.rationale,
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

function q(s: string | null | undefined): string {
  return `"${(s ?? '').replace(/"/g, '""')}"`;
}

function generateCSV(data: ReturnType<typeof buildExportData>): string {
  const lines: string[] = [];

  lines.push('Grant Export Report');
  lines.push(`Portfolio: ${data.meta.portfolioName}`);
  lines.push(`Generated: ${new Date(data.meta.generatedAt).toLocaleString()}`);
  lines.push(`Total Grants: ${data.meta.grantCount}`);
  lines.push('');

  lines.push('GRANTS');
  lines.push('Name,Type,Lifecycle Stage,Risk Level,Owner ID,Requested Amount,Approved Amount,Funds Allocated,Currency,Period Start,Period End,Reporting Frequency,Next Report Due,Renewal Eligible,Purpose,Sector,Country');
  for (const g of data.grants) {
    lines.push([
      q(g.name), g.grant_type || '', g.lifecycle_stage || '', g.risk_level || '',
      g.owner_id || '', g.requested_amount ?? '', g.approved_amount ?? '', g.funds_allocated ?? 0,
      g.currency || 'USD', g.grant_period_start || '', g.grant_period_end || '',
      g.reporting_frequency || '', g.next_report_due || '',
      g.renewal_eligible ? 'Yes' : 'No',
      q(g.purpose), q(g.sector), g.country || '',
    ].join(','));
  }
  lines.push('');

  if (data.decisions && data.decisions.length > 0) {
    lines.push('DECISIONS');
    lines.push('Grant ID,Decision Type,Decision,Date,Amount,Rationale');
    for (const d of data.decisions) {
      lines.push([
        d.grant_id, d.decision_type || '', d.decision || '',
        d.decision_date || '', d.amount ?? '', q(d.rationale),
      ].join(','));
    }
    lines.push('');
  }

  if (data.milestones.length > 0) {
    lines.push('MILESTONES');
    lines.push('Grant ID,Name,Description,Due Date,Completed Date,Status,Notes');
    for (const m of data.milestones) {
      lines.push([m.grant_id, q(m.milestone_name), q(m.description), m.due_date || '', m.completed_date || '', m.status || '', q(m.notes)].join(','));
    }
    lines.push('');
  }

  if (data.payments.length > 0) {
    lines.push('PAYMENTS');
    lines.push('Grant ID,#,Payment Type,Amount,Scheduled Date,Paid Date,Status,Conditions Met,Notes');
    for (const p of data.payments) {
      lines.push([
        p.grant_id, p.payment_number ?? '', p.payment_type || '',
        p.amount ?? 0, p.scheduled_date || '', p.paid_date || '',
        p.status || '', p.conditions_met ? 'Yes' : 'No', q(p.notes),
      ].join(','));
    }
    lines.push('');
  }

  if (data.budget_items.length > 0) {
    lines.push('BUDGET ITEMS');
    lines.push('Grant ID,Category,Description,Budgeted,Actual,Variance');
    for (const b of data.budget_items) {
      lines.push([b.grant_id, q(b.category), q(b.description), b.budgeted_amount ?? 0, b.actual_amount ?? '', b.variance ?? ''].join(','));
    }
  }

  return lines.join('\n');
}

function generateXLSX(data: ReturnType<typeof buildExportData>): Buffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Grant Export Report'],
    ['Portfolio', data.meta.portfolioName],
    ['Generated', new Date(data.meta.generatedAt).toLocaleString()],
    ['Total Grants', data.meta.grantCount],
  ]), 'Summary');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Name', 'Type', 'Lifecycle Stage', 'Risk Level', 'Owner ID', 'Requested', 'Approved', 'Funds Allocated', 'Currency', 'Period Start', 'Period End', 'Reporting Freq', 'Next Report Due', 'Renewal Eligible', 'Purpose', 'Sector', 'Country'],
    ...data.grants.map((g: any) => [
      g.name, g.grant_type, g.lifecycle_stage, g.risk_level, g.owner_id, g.requested_amount,
      g.approved_amount, g.funds_allocated, g.currency, g.grant_period_start,
      g.grant_period_end, g.reporting_frequency, g.next_report_due,
      g.renewal_eligible ? 'Yes' : 'No', g.purpose, g.sector, g.country,
    ]),
  ]), 'Grants');

  if (data.decisions && data.decisions.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Grant ID', 'Decision Type', 'Decision', 'Date', 'Amount', 'Rationale'],
      ...data.decisions.map((d: any) => [d.grant_id, d.decision_type, d.decision, d.decision_date, d.amount, d.rationale]),
    ]), 'Decisions');
  }

  if (data.milestones.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Grant ID', 'Milestone', 'Description', 'Due Date', 'Completed Date', 'Status', 'Notes'],
      ...data.milestones.map((m: any) => [m.grant_id, m.milestone_name, m.description, m.due_date, m.completed_date, m.status, m.notes]),
    ]), 'Milestones');
  }

  if (data.payments.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Grant ID', '#', 'Payment Type', 'Amount', 'Scheduled Date', 'Paid Date', 'Status', 'Conditions Met', 'Notes'],
      ...data.payments.map((p: any) => [p.grant_id, p.payment_number, p.payment_type, p.amount, p.scheduled_date, p.paid_date, p.status, p.conditions_met ? 'Yes' : 'No', p.notes]),
    ]), 'Payments');
  }

  if (data.budget_items.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Grant ID', 'Category', 'Description', 'Budgeted', 'Actual', 'Variance'],
      ...data.budget_items.map((b: any) => [b.grant_id, b.category, b.description, b.budgeted_amount, b.actual_amount, b.variance]),
    ]), 'Budget');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildExportData(d: any) { return d; }
