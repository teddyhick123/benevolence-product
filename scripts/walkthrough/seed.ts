/* eslint-disable no-console */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { assertSupportedNode, getLocalStatus } from './lib';
import { fixtureIds, personas, WALKTHROUGH_PASSWORD, type PersonaName } from '../../tests/walkthrough/personas';

const FULL_MODULES = {
  portfolio: true,
  impact_tracking: true,
  reports: true,
  tax: true,
  grant_management: true,
  donors: true,
  pledges: true,
  external_data: true,
  analytics: true,
  compliance: true,
  quickbooks: false,
  import: true,
  ai_assistant: true,
};

const MINIMAL_MODULES = {
  portfolio: true,
  impact_tracking: false,
  reports: false,
  tax: false,
  grant_management: false,
  donors: false,
  pledges: false,
  external_data: false,
  analytics: false,
  compliance: false,
  quickbooks: false,
  import: false,
  ai_assistant: false,
};

function fail(message: string, error?: unknown): never {
  throw new Error(`${message}${error ? `: ${JSON.stringify(error)}` : ''}`);
}

async function insert(sb: SupabaseClient, table: string, rows: object | object[]) {
  const { error } = await sb.from(table).insert(rows);
  if (error) fail(`Failed to seed ${table}`, error);
}

async function createUsers(sb: SupabaseClient) {
  const ids = {} as Record<PersonaName, string>;

  for (const [name, persona] of Object.entries(personas) as Array<[PersonaName, (typeof personas)[PersonaName]]>) {
    const { data, error } = await sb.auth.admin.createUser({
      email: persona.email,
      password: WALKTHROUGH_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: persona.fullName, walkthrough_persona: name },
    });
    if (error || !data.user) fail(`Failed to create ${name}`, error);
    ids[name] = data.user.id;
  }

  return ids;
}

async function verify(sb: SupabaseClient) {
  const expectations: Array<[string, number]> = [
    ['organizations', 3],
    ['organization_members', 8],
    ['portfolios', 3],
    ['portfolio_members', 8],
    ['holdings', 2],
    ['grants', 1],
    ['grant_status_history', 1],
    ['onboarding_sessions', 7],
  ];

  for (const [table, expected] of expectations) {
    const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
    if (error) fail(`Failed to verify ${table}`, error);
    if (count !== expected) fail(`Expected ${expected} ${table} rows, found ${count}`);
  }
}

async function main() {
  assertSupportedNode();
  const status = getLocalStatus();
  const sb = createClient(status.apiUrl, status.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const users = await createUsers(sb);

  const { error: appAdminError } = await sb.from('profiles').update({ is_app_admin: true }).eq('id', users.appAdmin);
  if (appAdminError) fail('Failed to grant app admin role', appAdminError);

  await insert(sb, 'organizations', [
    {
      id: fixtureIds.orgs.alpha,
      name: 'Alpha Foundation',
      slug: 'alpha-foundation',
      org_type: 'private_foundation',
      modules: FULL_MODULES,
      city: 'San Francisco',
      state: 'CA',
    },
    {
      id: fixtureIds.orgs.beta,
      name: 'Beta Foundation',
      slug: 'beta-foundation',
      org_type: 'private_foundation',
      modules: MINIMAL_MODULES,
      city: 'Oakland',
      state: 'CA',
    },
    {
      id: fixtureIds.orgs.gamma,
      name: 'Gamma Foundation',
      slug: 'gamma-foundation',
      org_type: 'private_foundation',
      modules: MINIMAL_MODULES,
      city: 'Seattle',
      state: 'WA',
    },
  ]);

  await insert(sb, 'organization_members', [
    { org_id: fixtureIds.orgs.alpha, user_id: users.appAdmin, role: 'owner', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.alpha, user_id: users.orgOwner, role: 'owner', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.alpha, user_id: users.orgAdmin, role: 'admin', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.alpha, user_id: users.member, role: 'member', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.alpha, user_id: users.viewer, role: 'viewer', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.alpha, user_id: users.multiOrgMember, role: 'member', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.beta, user_id: users.multiOrgMember, role: 'admin', accepted_at: new Date().toISOString() },
    { org_id: fixtureIds.orgs.gamma, user_id: users.outsider, role: 'owner', accepted_at: new Date().toISOString() },
  ]);

  await insert(sb, 'portfolios', [
    {
      id: fixtureIds.portfolios.alpha,
      org_id: fixtureIds.orgs.alpha,
      owner_id: users.orgOwner,
      name: 'Alpha Impact Portfolio',
      description: 'Deterministic walkthrough portfolio for Alpha Foundation.',
      settings: { base_currency: 'USD', show_map: false },
    },
    {
      id: fixtureIds.portfolios.beta,
      org_id: fixtureIds.orgs.beta,
      owner_id: users.multiOrgMember,
      name: 'Beta Core Portfolio',
      description: 'Minimal-module organization for switching and gating walkthroughs.',
      settings: { base_currency: 'USD', show_map: false },
    },
    {
      id: fixtureIds.portfolios.gamma,
      org_id: fixtureIds.orgs.gamma,
      owner_id: users.outsider,
      name: 'Gamma Private Portfolio',
      description: 'Isolation target for walkthrough authorization checks.',
      settings: { base_currency: 'USD', show_map: false },
    },
  ]);

  await insert(sb, 'portfolio_members', [
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.appAdmin, role: 'owner' },
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.orgOwner, role: 'owner' },
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.orgAdmin, role: 'admin' },
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.member, role: 'member' },
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.viewer, role: 'viewer' },
    { portfolio_id: fixtureIds.portfolios.alpha, user_id: users.multiOrgMember, role: 'member' },
    { portfolio_id: fixtureIds.portfolios.beta, user_id: users.multiOrgMember, role: 'admin' },
    { portfolio_id: fixtureIds.portfolios.gamma, user_id: users.outsider, role: 'owner' },
  ]);

  await insert(sb, 'holdings', [
    {
      id: fixtureIds.holdings.alphaGrant,
      portfolio_id: fixtureIds.portfolios.alpha,
      org_id: fixtureIds.orgs.alpha,
      asset_type: 'foundation_grant',
      status: 'active',
      name: 'Alpha Education Initiative',
      amount_invested: 125000,
      current_value: 125000,
      focus_area: ['education'],
    },
    {
      id: fixtureIds.holdings.gammaGrant,
      portfolio_id: fixtureIds.portfolios.gamma,
      org_id: fixtureIds.orgs.gamma,
      asset_type: 'foundation_grant',
      status: 'active',
      name: 'Gamma Confidential Initiative',
      amount_invested: 900000,
      current_value: 900000,
      focus_area: ['health'],
    },
  ]);

  await insert(sb, 'grants', {
    id: fixtureIds.grants.alphaDraft,
    holding_id: fixtureIds.holdings.alphaGrant,
    org_id: fixtureIds.orgs.alpha,
    portfolio_id: fixtureIds.portfolios.alpha,
    lifecycle_stage: 'draft',
    purpose: 'Expand after-school literacy programs.',
    requested_amount: 125000,
    currency: 'USD',
    internal_owner_id: users.orgAdmin,
    risk_level: 'low',
  });

  await insert(sb, 'grant_status_history', {
    id: 'aaaaaaaa-3000-4000-8000-000000000001',
    grant_id: fixtureIds.grants.alphaDraft,
    org_id: fixtureIds.orgs.alpha,
    from_stage: null,
    to_stage: 'draft',
    reason: 'Walkthrough fixture created',
    actor_id: users.orgAdmin,
  });

  const completedPersonas = (Object.keys(personas) as PersonaName[]).filter(name => name !== 'newUser');
  await insert(sb, 'onboarding_sessions', completedPersonas.map((name, index) => ({
    id: `dddddddd-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    user_id: users[name],
    organization_id: name === 'outsider'
      ? fixtureIds.orgs.gamma
      : name === 'multiOrgMember'
        ? fixtureIds.orgs.beta
        : fixtureIds.orgs.alpha,
    status: 'completed',
    completed_at: new Date().toISOString(),
  })));

  await verify(sb);
  console.log('Seeded walkthrough personas:');
  for (const [name, persona] of Object.entries(personas)) {
    console.log(`  ${name.padEnd(10)} ${persona.email}`);
  }
  console.log(`  password   ${WALKTHROUGH_PASSWORD}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
