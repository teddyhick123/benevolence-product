import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { isWorkspaceManager } from '@/lib/roles';

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

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) } });
}

async function requireWorkspaceManager(orgId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!isWorkspaceManager(role)) return { error: json({ error: 'Admin access required' }, { status: 403 }) };
  return { user };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireWorkspaceManager(orgId);
    if ('error' in auth) return auth.error;
    const { data, error } = await createAdminClient()
      .from('org_ai_context')
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .eq('org_id', orgId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return json({ data: data || [] });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireWorkspaceManager(orgId);
    if ('error' in auth) return auth.error;
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    const { data, error } = await createAdminClient()
      .from('org_ai_context')
      .insert({ org_id: orgId, ...parsed.data, source: 'builder_chat', created_by: auth.user.id })
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const auth = await requireWorkspaceManager(orgId);
    if ('error' in auth) return auth.error;
    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    const { data, error } = await createAdminClient()
      .from('org_ai_context')
      .update({ is_active: parsed.data.is_active })
      .eq('id', parsed.data.id)
      .eq('org_id', orgId)
      .select('id, context_type, context_key, context_value, source, is_active, created_at, updated_at')
      .single();
    if (error) throw error;
    return json({ data });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
