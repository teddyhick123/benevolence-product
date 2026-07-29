// app/api/admin/import/mapping-profiles/route.ts
// GET: list mapping profiles; POST: create or update a mapping profile

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

const mappingProfileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  source_type: z.enum(['blackbaud_re_nxt', 'salesforce_npsp', 'donorperfect', 'custom_csv']),
  description: z.string().nullable().optional(),
  entity_mappings: z.record(z.string(), z.unknown()),
  org_id: z.string().uuid().optional(),
}).strict().refine(value => value.id || value.org_id, {
  message: 'org_id is required when creating a mapping profile',
  path: ['org_id'],
});

export async function GET(req: NextRequest) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');

  let query = access.context.db
    .from('import_mapping_profiles')
    .select('*')
    .order('name');

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) return jsonError(error.message, 500);

  return jsonOk({ profiles: data });
}

export async function POST(req: NextRequest) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const parsed = mappingProfileSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { id, name, source_type, description, entity_mappings, org_id } = parsed.data;
  const { db } = access.context;

  if (id) {
    const updateData: Record<string, unknown> = { name, source_type, description, entity_mappings };
    if (org_id) updateData.org_id = org_id;
    // Update existing
    const { data, error } = await db
      .from('import_mapping_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ profile: data });
  } else {
    // Create new
    const { data, error } = await db
      .from('import_mapping_profiles')
      .insert({
        name,
        source_type,
        description,
        entity_mappings,
        org_id: org_id!,
        created_by: access.context.user.id,
      })
      .select()
      .single();

    if (error) return jsonError(error.message, 500);
    return jsonOk({ profile: data }, { status: 201 });
  }
}
