import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';

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

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const statusFilter = searchParams.get('status');
    // days param: return filings due within N days ahead; always include overdue
    const days = parseInt(searchParams.get('days') || '365');
    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + days);

    let query = supabase
      .from('filing_calendar')
      .select('*')
      .eq('org_id', orgId)
      .lte('due_date', horizonDate.toISOString().slice(0, 10))
      .order('due_date');

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    } else {
      // Exclude completed/waived/not_applicable by default; always show overdue
      query = query.in('status', ['upcoming', 'in_progress', 'extended', 'overdue']);
    }

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

    // Fire-and-forget: sync task state with the new filing status
    const newStatus = updates.status as string | undefined;
    if (newStatus && ['filed', 'waived', 'not_applicable'].includes(newStatus)) {
      (async () => {
        try {
          const adminDb = createAdminClient();
          const sourcePrefix = `filing:${id}:`;
          if (newStatus === 'filed') {
            await completeGeneratedTasks(adminDb, orgId, sourcePrefix, 'Filing marked as filed');
          } else if (newStatus === 'waived') {
            await cancelGeneratedTasks(adminDb, orgId, sourcePrefix, 'Filing waived');
          } else if (newStatus === 'not_applicable') {
            await cancelGeneratedTasks(adminDb, orgId, sourcePrefix, 'Filing marked not applicable');
          }
        } catch (err) {
          console.warn('[task-hook] Failed to update compliance filing tasks:', err);
        }
      })();
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
