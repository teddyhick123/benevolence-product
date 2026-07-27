import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

// Fields that can be PATCHed; lifecycle_stage is excluded — use /transition instead
const PATCHABLE_FIELDS = new Set([
  'purpose',
  'requested_amount',
  'approved_amount',
  'internal_owner_id',
  'risk_level',
  'reporting_frequency',
  'renewal_eligible',
  'grant_period_start',
  'grant_period_end',
  'grant_type',
  'currency',
]);

interface RouteParams {
  params: Promise<{ orgId: string; grantId: string }>;
}

function errorMessage(error: unknown): string {
  return typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    ? error.message
    : 'Internal error';
}

// GET /api/org/[orgId]/grants/[grantId]
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;
    const db = access.context.db;

    // Main grant row with holding
    const { data: grant, error: grantErr } = await db
      .from('grants')
      .select(
        `*, holdings(id, name, ein, city, country, investee_id, asset_type,
           amount_invested, currency, investment_date, exit_date)`
      )
      .eq('id', grantId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (grantErr) throw grantErr;
    if (!grant) return jsonError('Grant not found', 404);

    // Parallel fetches for the detail workspace
    const [healthResult, tasksResult, paymentsResult, commsResult, historyResult] =
      await Promise.all([
        db
          .from('v_grant_health')
          .select('*')
          .eq('grant_id', grantId)
          .maybeSingle(),
        db
          .from('task_entity_links')
          .select('task_id, relationship, tasks(id, title, status, priority, due_at, task_type)')
          .eq('entity_type', 'grant')
          .eq('entity_id', grantId)
          .order('task_id'),
        db
          .from('grant_payments')
          .select('*')
          .eq('grant_id', grantId)
          .order('payment_number', { ascending: true })
          .limit(20),
        db
          .from('grant_communications')
          .select('*')
          .eq('grant_id', grantId)
          .order('communication_date', { ascending: false })
          .limit(10),
        db
          .from('grant_status_history')
          .select('*')
          .eq('grant_id', grantId)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

    return jsonOk({
      grant,
      health: healthResult.data ?? null,
      tasks: tasksResult.data ?? [],
      payments: paymentsResult.data ?? [],
      communications: commsResult.data ?? [],
      history: historyResult.data ?? [],
    });
  } catch (err: unknown) {
    return jsonError(errorMessage(err), 500);
  }
}

// PATCH /api/org/[orgId]/grants/[grantId]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, grantId } = await params;

    const access = await requireOrgAccess(orgId, 'member');
    if (!access.ok) return access.response;
    const db = access.context.db;

    const body = await req.json();

    // Only allow patchable fields; reject attempts to change lifecycle_stage directly
    if ('lifecycle_stage' in body) {
      return jsonError('Use the /transition endpoint to change lifecycle_stage', 422);
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (PATCHABLE_FIELDS.has(key)) {
        update[key] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return jsonError('No patchable fields provided', 400);
    }

    // Verify grant belongs to org
    const { data: existing } = await db
      .from('grants')
      .select('id')
      .eq('id', grantId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return jsonError('Grant not found', 404);

    if (update.internal_owner_id) {
      const { data: owner } = await db
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', update.internal_owner_id as string)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      if (!owner) return jsonError('internal_owner_id is not a member of this organization', 400);
    }

    const { data, error } = await db
      .from('grants')
      .update(update)
      .eq('id', grantId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw error;

    return jsonOk({ data });
  } catch (err: unknown) {
    return jsonError(errorMessage(err), 500);
  }
}
