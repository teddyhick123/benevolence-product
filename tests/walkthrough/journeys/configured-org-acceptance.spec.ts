import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { personas } from '../personas';
import { executeTool } from '../../../lib/builder/tools';

const COLD_APP_TIMEOUT = 120_000;

test.setTimeout(360_000);

test('configured onboarding provisions runtime config and powers the grant workflow', async ({ page, adminDb }) => {
  const orgName = 'Walkthrough Configured Awards Foundation';
  const userEmail = personas.newUser.email;

  await adminDb.from('organizations').delete().eq('name', orgName);
  await loginAs(page, 'newUser');
  const request = page.context().request;

  let orgId: string | null = null;
  let portfolioId: string | null = null;
  let sessionId: string | null = null;
  let grantId: string | null = null;

  try {
    const { data: profile, error: profileError } = await adminDb
      .from('profiles')
      .select('id')
      .eq('email', userEmail)
      .single();
    expect(profileError).toBeNull();
    expect(profile?.id).toBeTruthy();
    const userId = profile!.id as string;

    const { data: session, error: sessionError } = await adminDb
      .from('onboarding_sessions')
      .insert({
        user_id: userId,
        status: 'conversation',
        quick_intake: {
          org_name: orgName,
          org_type: 'private_foundation',
        },
      })
      .select('id')
      .single();
    expect(sessionError).toBeNull();
    sessionId = session!.id as string;

    const configuredProfile = {
      grant_cycle: {
        checklist_items: [
          {
            stage_key: 'due_diligence',
            item_key: 'site_visit',
            label: 'Site visit completed',
            required: true,
          },
        ],
        custom_fields: [
          {
            entity_type: 'grant',
            field_label: 'Strategic Alignment Score',
            field_type: 'integer',
            required_at_stage: 'due_diligence',
          },
        ],
        stage_labels: {
          due_diligence: { label: 'Site Review' },
        },
      },
      automation_preferences: {
        rules: [
          {
            name: 'Active award check-in',
            trigger_type: 'grant_stage_change',
            trigger_config: { stage: 'active' },
            action_type: 'create_task',
            action_config: {
              title_template: 'Schedule 90-day check-in: {{grant_name}}',
              due_days: 7,
              task_type: 'follow_up',
              priority: 'normal',
            },
          },
        ],
      },
      org_context: [
        {
          context_type: 'operating_norm',
          context_key: 'site_visit_policy',
          context_value: 'We require a site visit before recommending first-time awards.',
        },
      ],
      view_preferences: {
        dashboard_layout: {
          sections: ['payout', 'grants', 'tasks'],
          hidden_sections: ['map'],
        },
        grant_default_view: 'attention',
        grant_table_columns: ['name', 'stage', 'custom_fields'],
        entity_vocabulary: {
          grant: { singular: 'Award', plural: 'Awards' },
        },
      },
    };

    const { error: profileSeedError } = await adminDb
      .from('onboarding_profiles')
      .insert({
        session_id: sessionId,
        workflows: configuredProfile,
      });
    expect(profileSeedError).toBeNull();

    const provision = await request.post('/api/onboarding/provision', {
      data: {
        name: orgName,
        org_type: 'private_foundation',
        modules: { portfolio: true, grant_management: true, reports: true },
        session_id: sessionId,
      },
    });
    expect(provision.status()).toBe(201);
    const provisioned = await provision.json();
    orgId = provisioned.org_id;
    portfolioId = provisioned.portfolio_id;
    expect(orgId).toBeTruthy();
    expect(portfolioId).toBeTruthy();
    await setActiveOrg(page, orgId!);

    const [
      { data: workflowRows },
      { data: customFields },
      { data: automationRows },
      { data: contextRows },
      { data: viewRows },
    ] = await Promise.all([
      adminDb
        .from('org_workflow_config')
        .select('config_type, stage_key, config_key, config_value')
        .eq('org_id', orgId)
        .order('config_type'),
      adminDb
        .from('org_custom_field_definitions')
        .select('id, entity_type, field_key, field_label, field_type, required_at_stage')
        .eq('org_id', orgId),
      adminDb
        .from('org_automation_rules')
        .select('id, name, trigger_type, action_type, trigger_config')
        .eq('org_id', orgId),
      adminDb
        .from('org_ai_context')
        .select('context_key, context_value')
        .eq('org_id', orgId),
      adminDb
        .from('org_view_config')
        .select('config_scope, scope_key, config_value')
        .eq('org_id', orgId),
    ]);

    expect(workflowRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ config_type: 'stage_checklist', stage_key: 'due_diligence', config_key: 'site_visit' }),
      expect.objectContaining({ config_type: 'stage_label', stage_key: 'due_diligence', config_key: 'label' }),
    ]));
    expect(customFields).toEqual([expect.objectContaining({
      field_key: 'strategic_alignment_score',
      field_type: 'integer',
      required_at_stage: 'due_diligence',
    })]);
    expect(automationRows).toEqual([expect.objectContaining({
      name: 'Active award check-in',
      trigger_type: 'grant_stage_change',
      action_type: 'create_task',
    })]);
    expect(contextRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ context_key: 'site_visit_policy' }),
    ]));
    expect(viewRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ config_scope: 'entity_vocabulary', scope_key: 'entity.grant' }),
      expect.objectContaining({ config_scope: 'dashboard', scope_key: 'main' }),
      expect.objectContaining({ config_scope: 'module_default', scope_key: 'grant_module' }),
      expect.objectContaining({ config_scope: 'table_columns', scope_key: 'grants_table' }),
    ]));

    const viewConfig = await request.get(`/api/org/${orgId}/view-config?include_vocabulary=true`);
    expect(viewConfig.status()).toBe(200);
    const viewJson = await viewConfig.json();
    expect(viewJson.vocabulary.grant).toEqual({ singular: 'Award', plural: 'Awards' });

    await page.goto('/dashboard/grants', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Award Management/i })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByRole('button', { name: /New Award/i }).first()).toBeVisible();

    const createGrant = await request.post(`/api/org/${orgId}/grants`, {
      data: {
        portfolio_id: portfolioId,
        purpose: 'First-time community arts award',
        requested_amount: 50000,
        currency: 'USD',
        lifecycle_stage: 'due_diligence',
        new_grantee: {
          display_name: 'Configured Arts Grantee',
          country: 'US',
        },
      },
    });
    expect(createGrant.status()).toBe(201);
    const createdGrant = await createGrant.json();
    grantId = createdGrant.grant?.id;
    expect(grantId).toBeTruthy();

    const blocked = await request.post(`/api/org/${orgId}/grants/${grantId}/transition`, {
      data: { to_stage: 'recommended', reason: 'Try before requirements' },
    });
    expect(blocked.status()).toBe(422);
    const blockedJson = await blocked.json();
    expect(String(blockedJson.error)).toMatch(/workflow|transition blocked/i);
    expect(blockedJson.blocking_items).toEqual(expect.arrayContaining([
      expect.stringContaining('Site visit completed'),
      expect.stringContaining('Strategic Alignment Score'),
    ]));

    const checklist = await request.post(`/api/org/${orgId}/grants/${grantId}/checklist`, {
      data: {
        stage_key: 'due_diligence',
        item_key: 'site_visit',
        completed: true,
      },
    });
    expect(checklist.status()).toBe(200);

    const customField = customFields![0] as any;
    const setCustomField = await request.put(`/api/org/${orgId}/custom-fields/values`, {
      data: {
        entity_type: 'grant',
        entity_id: grantId,
        values: {
          [customField.field_key]: 4,
        },
      },
    });
    expect(setCustomField.status()).toBe(200);

    const recommended = await request.post(`/api/org/${orgId}/grants/${grantId}/transition`, {
      data: { to_stage: 'recommended', reason: 'Requirements complete' },
    });
    expect(recommended.status()).toBe(200);

    const active = await request.post(`/api/org/${orgId}/grants/${grantId}/transition`, {
      data: {
        to_stage: 'approved',
        reason: 'Board approval',
        decision: {
          decision_type: 'approval',
          decision: 'approved',
          decision_date: new Date().toISOString().slice(0, 10),
          notes: 'Approved in walkthrough',
        },
      },
    });
    expect(active.status()).toBe(200);
    const agreement = await request.post(`/api/org/${orgId}/grants/${grantId}/transition`, {
      data: { to_stage: 'agreement', reason: 'Agreement ready' },
    });
    expect(agreement.status()).toBe(200);
    const activate = await request.post(`/api/org/${orgId}/grants/${grantId}/transition`, {
      data: { to_stage: 'active', reason: 'Agreement signed' },
    });
    expect(activate.status()).toBe(200);

    const { data: generatedTask, error: taskError } = await adminDb
      .from('tasks')
      .select('id, title, source, task_type, metadata')
      .eq('org_id', orgId)
      .eq('source', 'automation')
      .ilike('title', 'Schedule 90-day check-in:%')
      .maybeSingle();
    expect(taskError).toBeNull();
    expect(generatedTask).toEqual(expect.objectContaining({
      source: 'automation',
      task_type: 'follow_up',
    }));

    const { data: runs } = await adminDb
      .from('org_automation_runs')
      .select('status, trigger_entity_type, trigger_entity_id')
      .eq('org_id', orgId)
      .eq('trigger_entity_id', grantId);
    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'completed', trigger_entity_type: 'grant' }),
    ]));

    const summary = await executeTool(
      'summarize_org_configuration',
      {},
      orgId!,
      userId,
      'Show me everything configured for our org',
      adminDb as any,
      adminDb as any
    );
    if (summary.type !== 'config_success') {
      throw new Error(`Expected configuration summary, got ${summary.type}`);
    }
    expect(summary.message).toContain('Workflow Configuration');
    expect(summary.message).toContain('Strategic Alignment Score');
    expect(summary.message).toContain('Active award check-in');
    expect(summary.message).toContain('Views and Vocabulary');
  } finally {
    if (orgId) {
      await adminDb.from('organizations').delete().eq('id', orgId);
    } else {
      await adminDb.from('organizations').delete().eq('name', orgName);
    }
    if (sessionId) {
      await adminDb.from('onboarding_sessions').delete().eq('id', sessionId);
    }
  }
});
