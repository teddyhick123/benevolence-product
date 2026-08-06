import { NextRequest, NextResponse } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

// GET /api/org/[orgId] — get org details + user role
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;
    const { role } = access.context;

    const { data: org, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (error || !org) {
      return json({ error: error?.message || 'Not found' }, { status: 404 });
    }

    return json({ ...org, role });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId] — update org (admin only)
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const body = await req.json();
    const allowed = ['name', 'description', 'ein', 'website', 'org_type', 'fiscal_year_end', 'state_of_incorporation', 'modules', 'branding'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: org, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json(org);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId] — delete organization (owner only)
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'owner');
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;
    const { user } = access.context;

    const { data: org, error } = await supabase
      .from('organizations')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        is_active: false,
      })
      .eq('id', orgId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }
    if (!org) return json({ error: 'Not found' }, { status: 404 });

    return new NextResponse(null, { status: 204, headers: NO_STORE });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
