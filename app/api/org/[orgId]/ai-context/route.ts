import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

const CONTEXT_TYPES = ['operating_norm', 'naming_convention', 'process_rule', 'preference'] as const;
const keyPattern = /^[a-z][a-z0-9_]{0,79}$/;

const createSchema = z.object({
  context_type: z.enum(CONTEXT_TYPES),
  context_key: z.string().trim().regex(keyPattern),
  context_value: z.string().trim().min(1).max(4000),
}).strict();

const updateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
}).strict();

interface RouteParams { params: Promise<{ orgId: string }>; }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;
    const { data, error } = await access.context.db
      .from('org_ai_context')
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .eq('org_id', orgId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return jsonOk({ data: data || [] });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { data, error } = await access.context.db
      .from('org_ai_context')
      .insert({ org_id: orgId, ...parsed.data, source: 'builder_chat', created_by: access.context.user.id })
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .single();
    if (error) throw error;
    return jsonOk({ data }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;
    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
    const { data, error } = await access.context.db
      .from('org_ai_context')
      .update({ is_active: parsed.data.is_active })
      .eq('id', parsed.data.id)
      .eq('org_id', orgId)
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .single();
    if (error) throw error;
    return jsonOk({ data });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
