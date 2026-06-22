import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import type { OrgType } from '@/lib/types/org';

export const dynamic = 'force-dynamic';

const VALID_ORG_TYPES: OrgType[] = [
  'private_foundation',
  'family_office',
  'daf_sponsor',
  'community_foundation',
  'nonprofit',
  'corporation',
  'individual',
];

function walkthroughFailurePoint(req: NextRequest) {
  if (process.env.WALKTHROUGH_MODE !== '1') return null;
  return req.headers.get('x-walkthrough-fail-after');
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Parse + validate body
    const body = await req.json();
    const { name, org_type, ein, modules } = body as {
      name?: string;
      org_type?: string;
      ein?: string;
      modules?: Record<string, boolean> | null;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!org_type || !VALID_ORG_TYPES.includes(org_type as OrgType)) {
      return NextResponse.json(
        { error: `org_type must be one of: ${VALID_ORG_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // 3. Prevent double-provision
    const { data: existing } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'User already belongs to an organization' },
        { status: 409 }
      );
    }

    // 4. Provision org via RPC (service role required)
    const admin = createAdminClient();
    const { data: orgId, error: rpcError } = await admin.rpc('provision_organization', {
      p_name: name.trim(),
      p_org_type: org_type,
      p_owner_user_id: user.id,
      p_ein: ein?.trim() || null,
      p_modules: modules ?? null,
    });

    if (rpcError) {
      console.error('provision_organization RPC error:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const org_id = orgId as string;

    // 5. Create default portfolio linked to the new org
    const { data: portfolio, error: portfolioError } = await admin
      .from('portfolios')
      .insert({
        org_id,
        owner_id: user.id,
        name: name.trim(),
        settings: { base_currency: 'USD' },
      })
      .select('id')
      .single();

    if (portfolioError) {
      console.error('Portfolio creation error:', portfolioError);
      await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json({ error: portfolioError.message }, { status: 500 });
    }

    if (walkthroughFailurePoint(req) === 'portfolio') {
      await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json(
        { error: 'Walkthrough fault: failed after portfolio creation' },
        { status: 500 }
      );
    }

    // 6. Add owner to portfolio_members
    const { error: portfolioMemberError } = await admin.from('portfolio_members').insert({
      portfolio_id: portfolio.id,
      user_id: user.id,
      role: 'owner',
    });
    if (portfolioMemberError) {
      console.error('Portfolio membership creation error:', portfolioMemberError);
      await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json({ error: portfolioMemberError.message }, { status: 500 });
    }

    return NextResponse.json({ org_id, portfolio_id: portfolio.id }, { status: 201 });
  } catch (err: any) {
    console.error('Provision error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
