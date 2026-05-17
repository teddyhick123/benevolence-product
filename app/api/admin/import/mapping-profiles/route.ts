// app/api/admin/import/mapping-profiles/route.ts
// GET: list mapping profiles; POST: create or update a mapping profile

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');

  const supabase = createAdminClient();
  let query = supabase
    .from('import_mapping_profiles')
    .select('*')
    .order('name');

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profiles: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id, name, source_type, description, entity_mappings, org_id } = body;

  if (!name || !source_type || !entity_mappings || (!id && !org_id)) {
    return NextResponse.json(
      { error: 'name, source_type, entity_mappings, and org_id are required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  if (id) {
    const updateData: Record<string, unknown> = { name, source_type, description, entity_mappings };
    if (org_id) updateData.org_id = org_id;
    // Update existing
    const { data, error } = await supabase
      .from('import_mapping_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } else {
    // Create new
    const { data, error } = await supabase
      .from('import_mapping_profiles')
      .insert({ name, source_type, description, entity_mappings, org_id: org_id || null, created_by: userId })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data }, { status: 201 });
  }
}
