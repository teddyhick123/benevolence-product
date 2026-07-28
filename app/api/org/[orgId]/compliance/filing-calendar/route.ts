import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { createOrgComplianceRepository } from '@/lib/api/repositories/compliance';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filingStatusSchema = z.enum([
  'upcoming',
  'in_progress',
  'filed',
  'extended',
  'overdue',
  'waived',
  'not_applicable',
]);
const filingFields = {
  filing_type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  due_date: dateSchema,
  description: z.string().max(10_000).nullable(),
  jurisdiction: z.string().trim().max(100).nullable(),
  extension_due_date: dateSchema.nullable(),
  period_start: dateSchema.nullable(),
  period_end: dateSchema.nullable(),
  reminder_days: z.array(z.number().int().min(0).max(730)).max(20),
  is_recurring: z.boolean(),
  recurrence_rule: z.string().trim().max(1_000).nullable(),
};
const createFilingSchema = z.object({
  filing_type: filingFields.filing_type,
  title: filingFields.title,
  due_date: filingFields.due_date,
  description: filingFields.description.optional(),
  jurisdiction: filingFields.jurisdiction.optional(),
  extension_due_date: filingFields.extension_due_date.optional(),
  period_start: filingFields.period_start.optional(),
  period_end: filingFields.period_end.optional(),
  reminder_days: filingFields.reminder_days.optional(),
  is_recurring: filingFields.is_recurring.optional(),
  recurrence_rule: filingFields.recurrence_rule.optional(),
}).strict();
const updateFilingSchema = z.object({
  id: z.string().uuid(),
  filing_type: filingFields.filing_type.optional(),
  title: filingFields.title.optional(),
  due_date: filingFields.due_date.optional(),
  status: filingStatusSchema.optional(),
  description: filingFields.description.optional(),
  jurisdiction: filingFields.jurisdiction.optional(),
  extension_due_date: filingFields.extension_due_date.optional(),
  period_start: filingFields.period_start.optional(),
  period_end: filingFields.period_end.optional(),
  completed_at: z.string().datetime().nullable().optional(),
  completed_by: z.string().uuid().nullable().optional(),
  completed_by_name: z.string().trim().max(300).nullable().optional(),
  filing_reference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  reminder_days: filingFields.reminder_days.optional(),
  is_recurring: filingFields.is_recurring.optional(),
  recurrence_rule: filingFields.recurrence_rule.optional(),
}).strict();

// GET /api/org/[orgId]/compliance/filing-calendar?status=upcoming
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;
    const { searchParams } = new URL(req.url);

    const rawStatus = searchParams.get('status');
    const parsedStatus = rawStatus ? filingStatusSchema.safeParse(rawStatus) : null;
    if (parsedStatus && !parsedStatus.success) {
      return jsonError('Invalid filing status', 400);
    }

    // Return filings due within N days ahead, while still including overdue rows.
    const requestedDays = Number.parseInt(searchParams.get('days') || '365', 10);
    const days = Number.isFinite(requestedDays) && requestedDays > 0
      ? Math.min(requestedDays, 730)
      : 365;
    const horizonDate = new Date();
    horizonDate.setDate(horizonDate.getDate() + days);

    let query = access.context.db
      .from('filing_calendar')
      .select('*')
      .eq('org_id', orgId)
      .lte('due_date', horizonDate.toISOString().slice(0, 10))
      .order('due_date');

    if (parsedStatus?.success) {
      query = query.eq('status', parsedStatus.data);
    } else {
      query = query.in('status', ['upcoming', 'in_progress', 'extended', 'overdue']);
    }

    const { data, error } = await query;
    if (error) return jsonError(error.message, 500);
    return jsonOk({ data: data || [] });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// POST /api/org/[orgId]/compliance/filing-calendar — create filing entry
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const parsed = createFilingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Validation failed', 400, { details: parsed.error.format() });
    }

    const input = parsed.data;
    const { data, error } = await access.context.db
      .from('filing_calendar')
      .insert({
        org_id: orgId,
        filing_type: input.filing_type,
        title: input.title,
        due_date: input.due_date,
        description: input.description || null,
        jurisdiction: input.jurisdiction || 'federal',
        extension_due_date: input.extension_due_date ?? null,
        period_start: input.period_start ?? null,
        period_end: input.period_end ?? null,
        reminder_days: input.reminder_days ?? [30, 14, 7],
        status: 'upcoming',
        is_recurring: input.is_recurring ?? false,
        recurrence_rule: input.recurrence_rule || null,
      })
      .select()
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

// PATCH /api/org/[orgId]/compliance/filing-calendar — update filing entry
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const parsed = updateFilingSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return jsonError('Validation failed', 400, { details: parsed.error.format() });
    }
    const { id, ...updates } = parsed.data;
    if (Object.keys(updates).length === 0) {
      return jsonError('No valid fields to update', 400);
    }

    const db = access.context.db;
    const { data: existing, error: existingError } = await db
      .from('filing_calendar')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (existingError) return jsonError(existingError.message, 500);
    if (!existing) return jsonError('Filing not found', 404);

    const { data, error } = await db
      .from('filing_calendar')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();
    if (error) return jsonError(error.message, 500);

    const newStatus = updates.status;
    if (newStatus && ['filed', 'waived', 'not_applicable'].includes(newStatus)) {
      try {
        const compliance = createOrgComplianceRepository({
          orgId,
          actorId: access.context.user.id,
        });
        await compliance.syncFilingStatusTasks(
          id,
          newStatus as 'filed' | 'waived' | 'not_applicable'
        );
      } catch (taskSyncError: unknown) {
        await db
          .from('filing_calendar')
          .update({
            filing_type: existing.filing_type,
            title: existing.title,
            due_date: existing.due_date,
            status: existing.status,
            description: existing.description,
            jurisdiction: existing.jurisdiction,
            extension_due_date: existing.extension_due_date,
            period_start: existing.period_start,
            period_end: existing.period_end,
            completed_at: existing.completed_at,
            completed_by: existing.completed_by,
            completed_by_name: existing.completed_by_name,
            filing_reference: existing.filing_reference,
            notes: existing.notes,
            reminder_days: existing.reminder_days,
            is_recurring: existing.is_recurring,
            recurrence_rule: existing.recurrence_rule,
          })
          .eq('id', id)
          .eq('org_id', orgId);
        return jsonError(
          taskSyncError instanceof Error ? taskSyncError.message : 'Task synchronization failed',
          500
        );
      }
    }

    return jsonOk({ data });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
