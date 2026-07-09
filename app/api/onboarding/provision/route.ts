import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import type { OrgType } from '@/lib/types/org';
import {
  automationRowsFromOnboardingProfile,
  contextRowsFromOnboardingProfile,
  customFieldRowsFromOnboardingProfile,
  viewRowsFromOnboardingProfile,
  workflowRowsFromOnboardingProfile,
} from '@/lib/onboarding-provision-config';

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
    const { name, org_type, ein, modules, session_id } = body as {
      name?: string;
      org_type?: string;
      ein?: string;
      modules?: Record<string, boolean> | null;
      session_id?: string;
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

    const requestedModules = modules && typeof modules === 'object'
      ? { ...modules, portfolio: true }
      : null;

    // 4. Provision org via RPC (service role required)
    const admin = createAdminClient();
    const { data: orgId, error: rpcError } = await admin.rpc('provision_organization', {
      p_name: name.trim(),
      p_org_type: org_type,
      p_owner_user_id: user.id,
      p_ein: ein?.trim() || null,
      p_modules: requestedModules,
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

    if (session_id) {
      const { data: session } = await admin
        .from('onboarding_sessions')
        .select('id, user_id')
        .eq('id', session_id)
        .maybeSingle();

      if (session?.user_id === user.id) {
        await admin
          .from('onboarding_sessions')
          .update({ organization_id: org_id })
          .eq('id', session_id);

        const { data: profile } = await admin
          .from('onboarding_profiles')
          .select('workflows')
          .eq('session_id', session_id)
          .maybeSingle();

        const contextRows = contextRowsFromOnboardingProfile(profile, org_id, user.id);
        if (contextRows.length > 0) {
          const { error: contextError } = await admin
            .from('org_ai_context')
            .upsert(contextRows, { onConflict: 'org_id,context_key' });
          if (contextError) {
            console.error('Org AI context seeding error:', contextError);
          }
        }

        const viewRows = viewRowsFromOnboardingProfile(profile, org_id);
        if (viewRows.length > 0) {
          const { error: viewError } = await admin
            .from('org_view_config')
            .upsert(viewRows, { onConflict: 'org_id,config_scope,scope_key' });
          if (viewError) {
            console.error('Org view config seeding error:', viewError);
          }
        }

        const workflowRows = workflowRowsFromOnboardingProfile(profile, org_id);
        if (workflowRows.length > 0) {
          const { error: workflowError } = await admin
            .from('org_workflow_config')
            .upsert(workflowRows, { onConflict: 'org_id,module,config_type,stage_key,config_key' });
          if (workflowError) {
            console.error('Org workflow config seeding error:', workflowError);
          }
        }

        const customFieldRows = customFieldRowsFromOnboardingProfile(profile, org_id);
        if (customFieldRows.length > 0) {
          const { error: customFieldError } = await admin
            .from('org_custom_field_definitions')
            .upsert(customFieldRows, { onConflict: 'org_id,entity_type,field_key' });
          if (customFieldError) {
            console.error('Org custom field seeding error:', customFieldError);
          }
        }

        const automationRows = automationRowsFromOnboardingProfile(profile, org_id, user.id);
        if (automationRows.length > 0) {
          const { error: automationError } = await admin
            .from('org_automation_rules')
            .insert(automationRows);
          if (automationError) {
            console.error('Org automation rule seeding error:', automationError);
          }
        }
      }
    }

    return NextResponse.json({ org_id, portfolio_id: portfolio.id }, { status: 201 });
  } catch (err: any) {
    console.error('Provision error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
