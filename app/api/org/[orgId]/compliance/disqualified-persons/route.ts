import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { isWorkspaceManager } from '@/lib/roles';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

function getAuthClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

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

    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    const { data: membership } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!membership) return json({ error: 'Access denied' }, { status: 403 });

    let query = sb
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

    return json({ data: data || [] });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
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
    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    const { data: membership } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!membership || !isWorkspaceManager(membership.role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { full_name, relationship_type, ...rest } = body;

    if (!full_name || !relationship_type) {
      return json({ error: 'full_name and relationship_type are required' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('disqualified_persons')
      .insert({ org_id: orgId, full_name, relationship_type, ...rest })
      .select()
      .single();

    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
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
    if (!id) return json({ error: 'id query param required' }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = getAuthClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });

    const sb = getServiceClient();

    const { data: membership } = await sb
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!membership || !isWorkspaceManager(membership.role)) {
      return json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data, error } = await sb
      .from('disqualified_persons')
      .update({ end_date: new Date().toISOString().split('T')[0], is_active: false })
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw error;
    return json({ data, message: 'Person terminated (soft delete)' });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
