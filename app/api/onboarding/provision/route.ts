import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import type { OrgType } from '@/lib/types/org';
import { enableModule } from '@/lib/modules';
import { ALL_MODULE_IDS, type ModuleId } from '@/lib/modules/types';
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
    const { name, org_type, ein, modules, module_ids, session_id } = body as {
      name?: string;
      org_type?: string;
      ein?: string;
      modules?: Record<string, boolean> | null;
      module_ids?: string[];
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

    // 3. Prevent double-provision while allowing an owner to retry a partial
    // setup for the same onboarding session.
    let onboardingSession: { id: string; user_id: string; organization_id?: string | null } | null = null;
    if (session_id) {
      const { data: session } = await supabase
        .from('onboarding_sessions')
        .select('id, user_id, organization_id')
        .eq('id', session_id)
        .maybeSingle();
      if (session?.user_id !== user.id) {
        return NextResponse.json({ error: 'Onboarding session not found' }, { status: 404 });
      }
      onboardingSession = session;
    }

    const { data: existing } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id);
    const existingOrgId = existing?.[0]?.org_id as string | undefined;
    const retryingExistingSetup = Boolean(existingOrgId && onboardingSession?.organization_id === existingOrgId);
    if (existingOrgId && !retryingExistingSetup) {
      return NextResponse.json(
        { error: 'User already belongs to an organization' },
        { status: 409 }
      );
    }

    const selectedModuleIds = Array.isArray(module_ids)
      ? module_ids.filter((moduleId): moduleId is ModuleId =>
        typeof moduleId === 'string' && (ALL_MODULE_IDS as readonly string[]).includes(moduleId) && moduleId !== 'core'
      )
      : [];
    const requestedModules = modules && typeof modules === 'object'
      ? { ...modules, portfolio: true }
      : selectedModuleIds.length > 0 ? { portfolio: true } : null;

    // 4. Provision org via RPC (service role required)
    const admin = createAdminClient();
    let org_id = existingOrgId;
    if (!org_id) {
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
      org_id = orgId as string;
    }

    // 5. Create default portfolio linked to the new org
    let portfolio: { id: string } | null = null;
    if (retryingExistingSetup) {
      const { data: existingPortfolio, error: existingPortfolioError } = await admin
        .from('portfolios')
        .select('id')
        .eq('org_id', org_id)
        .eq('owner_id', user.id)
        .maybeSingle();
      if (existingPortfolioError) {
        return NextResponse.json({ error: existingPortfolioError.message }, { status: 500 });
      }
      portfolio = existingPortfolio;
    }

    let portfolioError: { message: string } | null = null;
    if (!portfolio) {
      const result = await admin
        .from('portfolios')
        .insert({
          org_id,
          owner_id: user.id,
          name: name.trim(),
          settings: { base_currency: 'USD' },
        })
        .select('id')
        .single();
      portfolio = result.data;
      portfolioError = result.error;
    }

    if (portfolioError) {
      console.error('Portfolio creation error:', portfolioError);
      if (!retryingExistingSetup) await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json({ error: portfolioError.message }, { status: 500 });
    }
    if (!portfolio) {
      if (!retryingExistingSetup) await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json({ error: 'Foundation portfolio could not be found or created' }, { status: 500 });
    }

    if (walkthroughFailurePoint(req) === 'portfolio') {
      await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json(
        { error: 'Walkthrough fault: failed after portfolio creation' },
        { status: 500 }
      );
    }

    // 6. Add owner to portfolio_members. A retry keeps the existing
    // membership instead of attempting a duplicate insert.
    const { error: portfolioMemberError } = retryingExistingSetup
      ? { error: null }
      : await admin.from('portfolio_members').insert({
          portfolio_id: portfolio.id,
          user_id: user.id,
          role: 'owner',
        });
    if (portfolioMemberError) {
      console.error('Portfolio membership creation error:', portfolioMemberError);
      if (!retryingExistingSetup) await admin.from('organizations').delete().eq('id', org_id);
      return NextResponse.json({ error: portfolioMemberError.message }, { status: 500 });
    }

    const enabledModules: string[] = [];
    const moduleErrors: string[] = [];
    for (const moduleId of selectedModuleIds) {
      const result = await enableModule(admin, org_id, moduleId, user.id);
      if (result.success) enabledModules.push(...(result.enabledModules || [moduleId]));
      else moduleErrors.push(`${moduleId}: ${result.error || 'Unable to enable module'}`);
    }

    const setupErrors: string[] = [];
    if (session_id && onboardingSession?.user_id === user.id) {
      const { data: profile, error: profileError } = await admin
        .from('onboarding_profiles')
        .select('workflows')
        .eq('session_id', session_id)
        .maybeSingle();

      if (profileError) {
        setupErrors.push(`Foundation Blueprint: ${profileError.message}`);
      } else {
        const contextRows = contextRowsFromOnboardingProfile(profile, org_id, user.id);
        if (contextRows.length > 0) {
          const { error: contextError } = await admin
            .from('org_ai_context')
            .upsert(contextRows, { onConflict: 'org_id,context_key' });
          if (contextError) setupErrors.push(`Foundation Memory: ${contextError.message}`);
        }

        const viewRows = viewRowsFromOnboardingProfile(profile, org_id);
        if (viewRows.length > 0) {
          const { error: viewError } = await admin
            .from('org_view_config')
            .upsert(viewRows, { onConflict: 'org_id,config_scope,scope_key' });
          if (viewError) setupErrors.push(`Views and vocabulary: ${viewError.message}`);
        }

        const workflowRows = workflowRowsFromOnboardingProfile(profile, org_id);
        if (workflowRows.length > 0) {
          const { error: workflowError } = await admin
            .from('org_workflow_config')
            .upsert(workflowRows, { onConflict: 'org_id,module,config_type,stage_key,config_key' });
          if (workflowError) setupErrors.push(`Workflow configuration: ${workflowError.message}`);
        }

        const customFieldRows = customFieldRowsFromOnboardingProfile(profile, org_id);
        if (customFieldRows.length > 0) {
          const { error: customFieldError } = await admin
            .from('org_custom_field_definitions')
            .upsert(customFieldRows, { onConflict: 'org_id,entity_type,field_key' });
          if (customFieldError) setupErrors.push(`Custom fields: ${customFieldError.message}`);
        }

        const automationRows = automationRowsFromOnboardingProfile(profile, org_id, user.id, session_id);
        if (automationRows.length > 0) {
          const { error: automationError } = await admin
            .from('org_automation_rules')
            .upsert(automationRows, { onConflict: 'org_id,onboarding_session_id,name' });
          if (automationError) setupErrors.push(`Automations: ${automationError.message}`);
        }
      }
    }

    const provisioningHasErrors = moduleErrors.length > 0 || setupErrors.length > 0;
    if (session_id && onboardingSession?.user_id === user.id) {
      const { error: sessionUpdateError } = await admin
        .from('onboarding_sessions')
        .update(provisioningHasErrors
          ? { organization_id: org_id, status: 'recommendations', completed_at: null }
          : { organization_id: org_id, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', session_id);
      if (sessionUpdateError) {
        return NextResponse.json({ error: sessionUpdateError.message }, { status: 500 });
      }

      const { data: sessionTiming } = await admin
        .from('onboarding_sessions')
        .select('started_at')
        .eq('id', session_id)
        .maybeSingle();
      if (sessionTiming?.started_at) {
        const { error: analyticsError } = await admin
          .from('onboarding_analytics')
          .update({
            total_duration_seconds: Math.floor((Date.now() - new Date(sessionTiming.started_at).getTime()) / 1000),
            completed_successfully: !provisioningHasErrors,
          })
          .eq('session_id', session_id);
        if (analyticsError) console.error('Onboarding analytics update error:', analyticsError);
      }
    }

    return NextResponse.json({
      org_id,
      portfolio_id: portfolio.id,
      enabled_modules: Array.from(new Set(enabledModules)),
      module_errors: moduleErrors.length > 0 ? moduleErrors : undefined,
      setup_errors: setupErrors.length > 0 ? setupErrors : undefined,
    }, { status: provisioningHasErrors ? 207 : 201 });
  } catch (err: any) {
    console.error('Provision error:', err);
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 });
  }
}
