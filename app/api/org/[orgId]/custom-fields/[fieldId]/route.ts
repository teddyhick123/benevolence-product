import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { CUSTOM_FIELD_KEY_PATTERN, CUSTOM_FIELD_TYPES } from '@/lib/custom-fields';
import { isWorkspaceManager } from '@/lib/roles';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string; fieldId: string }>;
}

const patchSchema = z.object({
  field_label: z.string().trim().min(1).max(120).optional(),
  field_type: z.enum(CUSTOM_FIELD_TYPES).optional(),
  enum_options: z.array(z.object({
    value: z.string().regex(CUSTOM_FIELD_KEY_PATTERN).max(64),
    label: z.string().trim().min(1).max(120),
  })).max(50).nullable().optional(),
  required_at_stage: z.enum(LIFECYCLE_STAGES).nullable().optional(),
  is_ai_readable: z.boolean().optional(),
  sort_order: z.number().int().min(-1000).max(1000).optional(),
}).strict();

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, { ...init, headers: { ...NO_STORE, ...(init.headers || {}) } });
}

async function requireOrgAdmin(orgId: string) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: json({ error: 'Unauthorized' }, { status: 401 }) };

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!isWorkspaceManager(role)) {
    return { error: json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { supabase, user, role };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, fieldId } = await params;
    const auth = await requireOrgAdmin(orgId);
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }

    const db = createAdminClient();
    const { data: existing, error: fetchErr } = await db
      .from('org_custom_field_definitions')
      .select('id, entity_type, field_type')
      .eq('id', fieldId)
      .eq('org_id', orgId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!existing) return json({ error: 'Custom field not found' }, { status: 404 });

    const nextType = parsed.data.field_type ?? existing.field_type;
    if (parsed.data.required_at_stage && existing.entity_type !== 'grant') {
      return json({ error: 'required_at_stage is only supported for grant custom fields' }, { status: 400 });
    }
    if (nextType === 'enum') {
      if (parsed.data.field_type === 'enum' && (!parsed.data.enum_options || parsed.data.enum_options.length === 0)) {
        return json({ error: 'enum_options is required when changing a field to enum' }, { status: 400 });
      }
    } else if (parsed.data.enum_options && parsed.data.enum_options.length > 0) {
      return json({ error: 'enum_options is only supported for enum custom fields' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const key of ['field_label', 'field_type', 'required_at_stage', 'is_ai_readable', 'sort_order'] as const) {
      if (key in parsed.data) patch[key] = parsed.data[key] ?? null;
    }
    if ('enum_options' in parsed.data) {
      patch.enum_options = nextType === 'enum' ? parsed.data.enum_options : null;
    }

    if (Object.keys(patch).length === 0) return json({ error: 'No fields to update provided' }, { status: 400 });

    const { data, error } = await db
      .from('org_custom_field_definitions')
      .update(patch)
      .eq('id', fieldId)
      .eq('org_id', orgId)
      .select('id, org_id, entity_type, field_key, field_label, field_type, enum_options, required_at_stage, is_ai_readable, sort_order, created_at, updated_at')
      .single();

    if (error) throw error;
    return json({ data });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, fieldId } = await params;
    const auth = await requireOrgAdmin(orgId);
    if ('error' in auth) return auth.error;

    if (req.nextUrl.searchParams.get('confirm') !== 'true') {
      return json({ error: 'Deleting a custom field cascades to all values. Pass confirm=true to continue.' }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from('org_custom_field_definitions')
      .delete()
      .eq('id', fieldId)
      .eq('org_id', orgId)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) return json({ error: 'Custom field not found' }, { status: 404 });
    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
