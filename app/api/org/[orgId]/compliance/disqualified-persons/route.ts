import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable();
const disqualifiedPersonSchema = z.object({
  full_name: z.string().trim().min(1).max(300),
  relationship_type: z.enum([
    'substantial_contributor',
    'foundation_manager',
    '20pct_owner',
    'family_member',
    'corporation',
    'partnership',
    'trust',
    'other',
  ]),
  title: z.string().trim().max(200).optional().nullable(),
  ownership_pct: z.coerce.number().finite().min(0).max(100).optional().nullable(),
  is_active: z.boolean().optional(),
  start_date: dateSchema,
  end_date: dateSchema,
  notes: z.string().max(10_000).optional().nullable(),
}).strict();

/**
 * GET /api/org/[orgId]/compliance/disqualified-persons?q=name&active_only=true
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const activeOnly = searchParams.get('active_only') !== 'false';

    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    let query = access.context.db
      .from('disqualified_persons')
      .select('*')
      .eq('org_id', orgId)
      .order('full_name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (q) {
      query = query.ilike('full_name', `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return jsonOk({ data: data || [] });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * POST /api/org/[orgId]/compliance/disqualified-persons
 * Add a person to the §4946 registry
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;
    const parsed = disqualifiedPersonSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

    const { data, error } = await access.context.db
      .from('disqualified_persons')
      .insert({ org_id: orgId, ...parsed.data })
      .select()
      .single();

    if (error) throw error;
    return jsonOk({ data }, { status: 201 });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

/**
 * DELETE /api/org/[orgId]/compliance/disqualified-persons?id=<uuid>
 * Soft-delete by setting end_date to today (never hard-deletes for audit trail)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id query param required', 400);
    const access = await requireOrgAccess(orgId, 'admin');
    if (!access.ok) return access.response;

    const { data, error } = await access.context.db
      .from('disqualified_persons')
      .update({ end_date: new Date().toISOString().split('T')[0], is_active: false })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return jsonOk({ data, message: 'Person terminated (soft delete)' });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
