// app/api/portfolio/[id]/reports/export/route.ts
// Export data to CSV, Excel, or JSON
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

// Convert data to CSV format
function toCSV(data: any[], columns?: string[]): string {
  if (data.length === 0) return '';

  const headers = columns || Object.keys(data[0]);
  const rows = [headers.join(',')];

  for (const item of data) {
    const values = headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value);
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission check
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { data: { user } } = await sb.auth.getUser();

  const body = await req.json();
  const {
    data_type,
    format = 'csv',
    holding_id,
    date_from,
    date_to,
    save_document,
  } = body;

  if (!data_type) {
    return NextResponse.json({ error: 'data_type is required' }, { status: 400, headers: cacheHeaders() });
  }

  if (!['csv', 'json', 'xlsx'].includes(format)) {
    return NextResponse.json({ error: 'format must be csv, json, or xlsx' }, { status: 400, headers: cacheHeaders() });
  }

  let exportData: any[] = [];
  let filename = '';
  let columns: string[] = [];

  switch (data_type) {
    case 'holdings': {
      let query = sb
        .from('holdings')
        .select('id, name, sector, country, status, funds_allocated, asset_type, description, ein, created_at')
        .eq('portfolio_id', portfolio_id);

      if (holding_id) {
        query = query.eq('id', holding_id);
      }

      const { data, error } = await query.order('name');
      if (error) throw new Error(error.message);

      exportData = data || [];
      filename = `holdings_export_${new Date().toISOString().split('T')[0]}`;
      columns = ['id', 'name', 'sector', 'country', 'status', 'funds_allocated', 'asset_type', 'description', 'ein', 'created_at'];
      break;
    }

    case 'metrics': {
      let query = sb
        .from('metric_facts')
        .select(`
          id,
          holding_id,
          holdings(name),
          metric_code,
          value,
          unit,
          period_start,
          period_end,
          created_at
        `)
        .eq('portfolio_id', portfolio_id);

      if (holding_id) {
        query = query.eq('holding_id', holding_id);
      }
      if (date_from) {
        query = query.gte('period_start', date_from);
      }
      if (date_to) {
        query = query.lte('period_end', date_to);
      }

      const { data, error } = await query.order('period_end', { ascending: false });
      if (error) throw new Error(error.message);

      exportData = (data || []).map((m: any) => ({
        id: m.id,
        holding_id: m.holding_id,
        holding_name: m.holdings?.name,
        metric_code: m.metric_code,
        value: m.value,
        unit: m.unit,
        period_start: m.period_start,
        period_end: m.period_end,
        created_at: m.created_at,
      }));
      filename = `metrics_export_${new Date().toISOString().split('T')[0]}`;
      columns = ['id', 'holding_id', 'holding_name', 'metric_code', 'value', 'unit', 'period_start', 'period_end', 'created_at'];
      break;
    }

    case 'contributions': {
      const { data, error } = await sb
        .from('contributions')
        .select(`
          id,
          holding_id,
          holdings(name),
          contribution_date,
          amount,
          asset_type,
          cost_basis,
          fair_market_value,
          acquisition_date,
          tax_year,
          status,
          notes,
          created_at
        `)
        .eq('portfolio_id', portfolio_id)
        .order('contribution_date', { ascending: false });

      if (error) throw new Error(error.message);

      exportData = (data || []).map((c: any) => ({
        id: c.id,
        holding_id: c.holding_id,
        holding_name: c.holdings?.name,
        contribution_date: c.contribution_date,
        amount: c.amount,
        asset_type: c.asset_type,
        cost_basis: c.cost_basis,
        fair_market_value: c.fair_market_value,
        acquisition_date: c.acquisition_date,
        tax_year: c.tax_year,
        status: c.status,
        notes: c.notes,
        created_at: c.created_at,
      }));
      filename = `contributions_export_${new Date().toISOString().split('T')[0]}`;
      columns = ['id', 'holding_id', 'holding_name', 'contribution_date', 'amount', 'asset_type', 'cost_basis', 'fair_market_value', 'acquisition_date', 'tax_year', 'status', 'notes', 'created_at'];
      break;
    }

    case 'transactions': {
      const { data, error } = await sb
        .from('transactions')
        .select(`
          id,
          holding_id,
          holdings(name),
          transaction_date,
          transaction_type,
          amount,
          shares,
          price_per_share,
          fees,
          notes,
          created_at
        `)
        .eq('portfolio_id', portfolio_id)
        .order('transaction_date', { ascending: false });

      if (error) throw new Error(error.message);

      exportData = (data || []).map((t: any) => ({
        id: t.id,
        holding_id: t.holding_id,
        holding_name: t.holdings?.name,
        transaction_date: t.transaction_date,
        transaction_type: t.transaction_type,
        amount: t.amount,
        shares: t.shares,
        price_per_share: t.price_per_share,
        fees: t.fees,
        notes: t.notes,
        created_at: t.created_at,
      }));
      filename = `transactions_export_${new Date().toISOString().split('T')[0]}`;
      columns = ['id', 'holding_id', 'holding_name', 'transaction_date', 'transaction_type', 'amount', 'shares', 'price_per_share', 'fees', 'notes', 'created_at'];
      break;
    }

    default:
      return NextResponse.json({ error: 'Invalid data_type' }, { status: 400, headers: cacheHeaders() });
  }

  // Generate export content
  let content: string;
  let contentType: string;

  if (format === 'json') {
    content = JSON.stringify(exportData, null, 2);
    contentType = 'application/json';
  } else if (format === 'csv') {
    content = toCSV(exportData, columns);
    contentType = 'text/csv';
  } else {
    // For xlsx, we'd need a library like xlsx - for now return JSON with xlsx extension info
    content = JSON.stringify(exportData, null, 2);
    contentType = 'application/json';
  }

  // Optionally save as a document
  let savedDocument = null;
  if (save_document) {
    const { data: doc, error: docErr } = await sb
      .from('generated_documents')
      .insert({
        portfolio_id,
        title: `${data_type.charAt(0).toUpperCase() + data_type.slice(1)} Export`,
        document_type: 'export',
        format,
        scope: 'portfolio',
        content: { data: exportData, columns },
        config: { data_type, date_from, date_to, holding_id },
        file_size_bytes: content.length,
        generated_by: user?.id,
        status: 'generated',
      })
      .select()
      .single();

    if (!docErr) {
      savedDocument = doc;
    }
  }

  return NextResponse.json({
    export: {
      filename: `${filename}.${format}`,
      format,
      data_type,
      row_count: exportData.length,
      content,
      content_type: contentType,
    },
    document: savedDocument,
  }, { headers: cacheHeaders() });
}
