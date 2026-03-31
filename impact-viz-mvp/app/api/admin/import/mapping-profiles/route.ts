// app/api/admin/import/mapping-profiles/route.ts
// GET: list mapping profiles; POST: create or update a mapping profile

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';

async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

export async function GET(_req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('import_mapping_profiles')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profiles: data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, name, source_system, description, entity_mappings } = body;

  if (!name || !source_system || !entity_mappings) {
    return NextResponse.json(
      { error: 'name, source_system, and entity_mappings are required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from('import_mapping_profiles')
      .update({ name, source_system, description, entity_mappings })
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } else {
    // Create new
    const { data, error } = await supabase
      .from('import_mapping_profiles')
      .insert({ name, source_system, description, entity_mappings, created_by: userId })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data }, { status: 201 });
  }
}
