import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/compliance/filing-calendar?days=90&status=pending
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 90;
    const statusFilter = searchParams.get('status');
    const taxYear = searchParams.get('tax_year');

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    let query = supabase
      .from('filing_calendar')
      .select('*')
      .eq('organization_id', orgId)
      .order('due_date');

    if (days > 0) {
      query = query.lte('due_date', cutoffDate.toISOString().split('T')[0]);
    }
    if (statusFilter) query = query.eq('status', statusFilter);
    if (taxYear) query = query.eq('tax_year', parseInt(taxYear));

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/compliance/filing-calendar — create filing entry
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { filing_type, tax_year, due_date, description, filing_jurisdiction, extension_due_date, reminder_days } = body;

    if (!filing_type || !tax_year || !due_date) {
      return NextResponse.json({ error: 'filing_type, tax_year, and due_date are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('filing_calendar')
      .insert({
        organization_id: orgId,
        filing_type,
        tax_year,
        due_date,
        description: description || null,
        filing_jurisdiction: filing_jurisdiction || 'federal',
        extension_due_date: extension_due_date || null,
        reminder_days: reminder_days || [30, 14, 7],
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/compliance/filing-calendar — update filing entry
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const allowedFields = [
      'filing_type', 'tax_year', 'due_date', 'status', 'description',
      'filing_jurisdiction', 'extension_due_date', 'filed_date', 'filed_by',
      'confirmation_number', 'notes', 'reminder_days',
    ];
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in rest) updates[field] = rest[field];
    }

    const { data, error } = await supabase
      .from('filing_calendar')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
