import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/compliance/filing-calendar?status=upcoming
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const statusFilter = searchParams.get('status');

    let query = supabase
      .from('filing_calendar')
      .select('*')
      .eq('org_id', orgId)
      .order('due_date');

    if (statusFilter) query = query.eq('status', statusFilter);

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
    const {
      filing_type, title, due_date, description, jurisdiction,
      extension_due_date, period_start, period_end, reminder_days,
      is_recurring, recurrence_rule,
    } = body;

    if (!filing_type || !title || !due_date) {
      return NextResponse.json(
        { error: 'filing_type, title, and due_date are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('filing_calendar')
      .insert({
        org_id: orgId,
        filing_type,
        title,
        due_date,
        description: description || null,
        jurisdiction: jurisdiction || 'federal',
        extension_due_date: extension_due_date || null,
        period_start: period_start || null,
        period_end: period_end || null,
        reminder_days: reminder_days || [30, 14, 7],
        status: 'upcoming',
        is_recurring: is_recurring || false,
        recurrence_rule: recurrence_rule || null,
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
      'filing_type', 'title', 'due_date', 'status', 'description',
      'jurisdiction', 'extension_due_date', 'period_start', 'period_end',
      'completed_at', 'completed_by', 'filing_reference',
      'notes', 'reminder_days', 'is_recurring', 'recurrence_rule',
    ];
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in rest) updates[field] = rest[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('filing_calendar')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
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
