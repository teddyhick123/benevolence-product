import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// GET /api/org — list orgs the current user belongs to
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('organization_members')
      .select(`role, organizations (*)`)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizations = (data || []).map((row: any) => ({
      ...row.organizations,
      role: row.role,
    }));

    return NextResponse.json({ organizations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org — create a new organization
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { name, ein, org_type, fiscal_year_end, state_of_incorporation } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Create organization
    const { data: org, error: orgError } = await adminClient
      .from('organizations')
      .insert({
        name: name.trim(),
        ein: ein?.trim() || null,
        org_type: org_type || null,
        fiscal_year_end: fiscal_year_end || null,
        state_of_incorporation: state_of_incorporation?.trim() || null,
      })
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Add creator as owner
    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({
        org_id: org.id,
        user_id: user.id,
        role: 'owner',
      });

    if (memberError) {
      await adminClient.from('organizations').delete().eq('id', org.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json(org, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
