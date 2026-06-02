#!/usr/bin/env ts-node
/**
 * scripts/provision-client.ts
 * Provision a new client organization.
 *
 * Usage:
 *   npx ts-node scripts/provision-client.ts \
 *     --org-name "Foundation Name" \
 *     --admin-email admin@foundation.org \
 *     --org-type private_foundation \
 *     --mode demo|production \
 *     [--ein 12-3456789] \
 *     [--region us-east-1] \
 *     [--send-invite]
 *
 * Flags:
 *   --org-name      Display name of the organization (required)
 *   --admin-email   Email address for the admin user (required)
 *   --org-type      Organization type: private_foundation | family_office | daf_sponsor |
 *                   community_foundation | nonprofit | corporation | individual (required)
 *   --ein           EIN / tax ID (optional)
 *   --mode          demo (uses current Supabase project) or production (creates new project)
 *   --region        AWS region for new Supabase project (default: us-east-1)
 *   --send-invite   Send an invite email rather than creating user with temp password
 *   --help          Print this help text
 *
 * Environment variables (production mode):
 *   SUPABASE_ACCESS_TOKEN   Supabase Management API token
 *   SUPABASE_ORG_ID         Supabase organization ID
 *
 * Environment variables (demo mode):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Impact Platform';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const VALID_ORG_TYPES = [
  'private_foundation', 'family_office', 'daf_sponsor', 'community_foundation',
  'nonprofit', 'corporation', 'individual',
] as const;
type OrgType = typeof VALID_ORG_TYPES[number];

function printHelp(): void {
  console.log(`
${APP_NAME} Client Provisioning Script

Usage:
  npx ts-node scripts/provision-client.ts \\
    --org-name "Foundation Name" \\
    --admin-email admin@foundation.org \\
    --org-type private_foundation \\
    --mode demo|production \\
    [--ein 12-3456789] \\
    [--region us-east-1] \\
    [--send-invite]

Options:
  --org-name      Display name of the organization (required)
  --admin-email   Email address for the admin user (required)
  --org-type      Organization type (required):
                    private_foundation  — 501(c)(3) grantmaking foundation
                    family_office       — investment-focused family office
                    daf_sponsor         — donor-advised fund sponsor
                    community_foundation— community foundation
                    nonprofit           — operating nonprofit
                    corporation         — corporate giving program
                    individual          — individual philanthropist
  --ein           EIN / tax ID (optional, e.g. 12-3456789)
  --mode          demo  — use current Supabase project (default)
                  production — create a new Supabase project via Management API
  --region        AWS region for new project (default: us-east-1)
  --send-invite   Send invite email instead of creating user with temp password
  --help          Show this help text

Environment variables required for --mode production:
  SUPABASE_ACCESS_TOKEN   Supabase Management API personal access token
  SUPABASE_ORG_ID         Supabase organization ID (find in dashboard URL)

Examples:
  # Demo environment — private foundation
  npx ts-node scripts/provision-client.ts \\
    --org-name "Ashford Foundation" \\
    --admin-email admin@ashford.org \\
    --org-type private_foundation \\
    --ein 12-3456789 \\
    --mode demo

  # Production — family office with invite email
  SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_ORG_ID=yyy \\
  npx ts-node scripts/provision-client.ts \\
    --org-name "Ashford Capital" \\
    --admin-email admin@ashford.com \\
    --org-type family_office \\
    --mode production \\
    --send-invite
`);
}

function parseArgs(): {
  orgName: string;
  adminEmail: string;
  orgType: OrgType;
  ein: string | undefined;
  mode: 'demo' | 'production';
  region: string;
  sendInvite: boolean;
} {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const orgName = get('--org-name');
  const adminEmail = get('--admin-email');
  const orgType = (get('--org-type') || 'private_foundation') as OrgType;
  const ein = get('--ein');
  const mode = (get('--mode') || 'demo') as 'demo' | 'production';
  const region = get('--region') || 'us-east-1';
  const sendInvite = args.includes('--send-invite');

  if (!orgName) { console.error('Missing --org-name'); process.exit(1); }
  if (!adminEmail) { console.error('Missing --admin-email'); process.exit(1); }
  if (!VALID_ORG_TYPES.includes(orgType as any)) {
    console.error(`--org-type must be one of: ${VALID_ORG_TYPES.join(', ')}`);
    process.exit(1);
  }
  if (!['demo', 'production'].includes(mode)) { console.error('--mode must be demo or production'); process.exit(1); }

  return { orgName, adminEmail, orgType, ein, mode, region, sendInvite };
}

// ---------------------------------------------------------------------------
// Password generator
// ---------------------------------------------------------------------------
function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const rand = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [rand(upper), rand(upper), rand(lower), rand(lower), rand(digits), rand(digits), rand(special)];
  // fill to 12 chars
  const all = upper + lower + digits;
  while (base.length < 12) base.push(rand(all));
  // shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base.join('');
}

// ---------------------------------------------------------------------------
// Supabase Management API (production mode only)
// ---------------------------------------------------------------------------
async function createSupabaseProject(orgName: string, region: string): Promise<{
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  projectRef: string;
}> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN env var is required for production mode');

  const orgId = process.env.SUPABASE_ORG_ID;
  if (!orgId) throw new Error('SUPABASE_ORG_ID env var is required for production mode');

  const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 20);
  const dbPass = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2).toUpperCase() + '!';

  console.log(`Creating Supabase project: ${slug} (region: ${region})…`);

  const createRes = await fetch('https://api.supabase.com/v1/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: orgName,
      organization_id: orgId,
      plan: 'free',
      region,
      db_pass: dbPass,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Supabase project: ${err}`);
  }

  const project = await createRes.json() as any;
  const projectRef = project.ref;
  console.log(`  Project ref: ${projectRef}`);

  // Wait for project to be ready
  console.log('Waiting for project to be ready…');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const status = await statusRes.json() as any;
    if (status.status === 'ACTIVE_HEALTHY') { ready = true; break; }
    console.log(`  Status: ${status.status}…`);
  }

  if (!ready) throw new Error('Project did not become ready in time');

  // Get API keys
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const keys = await keysRes.json() as any[];
  const anonKey = keys.find((k: any) => k.name === 'anon')?.api_key || '';
  const serviceRoleKey = keys.find((k: any) => k.name === 'service_role')?.api_key || '';

  return {
    url: `https://${projectRef}.supabase.co`,
    anonKey,
    serviceRoleKey,
    projectRef,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { orgName, adminEmail, orgType, ein, mode, region, sendInvite } = parseArgs();
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  console.log(`\nProvisioning: ${orgName}`);
  console.log(`Type:         ${orgType}`);
  if (ein) console.log(`EIN:          ${ein}`);
  console.log(`Admin:        ${adminEmail}`);
  console.log(`Mode:         ${mode}`);
  if (sendInvite) console.log(`Send invite:  yes\n`);
  else console.log(`Send invite:  no (temp password will be generated)\n`);

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let supabaseServiceRoleKey: string;
  let projectRef = 'local';

  if (mode === 'production') {
    const proj = await createSupabaseProject(orgName, region);
    supabaseUrl = proj.url;
    supabaseAnonKey = proj.anonKey;
    supabaseServiceRoleKey = proj.serviceRoleKey;
    projectRef = proj.projectRef;
  } else {
    supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE || '';
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Step 1: Create auth user
  console.log('Creating admin user…');
  let userId: string | undefined;
  let tempPassword: string | undefined;

  if (sendInvite) {
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(adminEmail);
    if (inviteError && !inviteError.message.includes('already been registered')) {
      throw new Error(`Failed to invite user: ${inviteError.message}`);
    }
    if (inviteData?.user?.id) userId = inviteData.user.id;
  } else {
    tempPassword = generateTempPassword();
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (createError && !createError.message.includes('already been registered')) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }
    if (createData?.user?.id) userId = createData.user.id;
  }

  // Fall back to looking up existing user
  if (!userId) {
    const { data: users } = await adminClient.auth.admin.listUsers();
    const existing = users?.users?.find((u: any) => u.email === adminEmail);
    userId = existing?.id;
  }

  if (!userId) throw new Error('Could not determine admin user ID');
  console.log(`  User ID: ${userId}`);

  // Step 1b: Grant app-admin to this user
  console.log('Granting app-admin access…');
  const { error: adminErr } = await adminClient
    .from('profiles')
    .update({ is_app_admin: true })
    .eq('id', userId);
  if (adminErr) {
    // Profile row is created by a DB trigger on user creation — if the user was
    // just created it may not exist yet. Retry once after a brief wait.
    await new Promise(r => setTimeout(r, 2000));
    const { error: retryErr } = await adminClient
      .from('profiles')
      .update({ is_app_admin: true })
      .eq('id', userId);
    if (retryErr) console.warn(`  Warning: could not set is_app_admin — ${retryErr.message}`);
    else console.log('  App-admin granted (on retry)');
  } else {
    console.log('  App-admin granted');
  }

  // Step 2: Provision org via RPC (creates org + owner membership in one transaction,
  //          picks correct default modules for the org type)
  console.log('Provisioning organization…');
  const { data: orgId, error: provisionError } = await adminClient
    .rpc('provision_organization', {
      p_name: orgName,
      p_org_type: orgType,
      p_owner_user_id: userId,
      p_ein: ein ?? null,
      p_modules: null,  // use org-type defaults
    });

  if (provisionError) throw new Error(`Failed to provision org: ${provisionError.message}`);
  const orgIdStr = orgId as string;
  console.log(`  Org ID: ${orgIdStr}`);

  // Step 3: Run all migrations
  console.log('\nRunning database migrations…');
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

  if (projectRef && accessToken) {
    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && /^\d{4}_/.test(f))
      .sort();

    let applied = 0;
    let failed = 0;
    for (const filename of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf-8');
      process.stdout.write(`  ${filename}… `);
      try {
        const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.log('FAILED');
          console.error(`    ${err}`);
          failed++;
        } else {
          console.log('OK');
          applied++;
        }
      } catch (err: any) {
        console.log('FAILED');
        console.error(`    ${err.message}`);
        failed++;
      }
    }
    console.log(`\n  Migrations: ${applied} applied, ${failed} failed`);
    if (failed > 0) console.warn('  Warning: some migrations failed — check output above');
  } else if (mode === 'demo') {
    console.log('  Skipping migrations in demo mode — run `pnpm migrate-client` separately if needed.');
  } else {
    console.warn('  Warning: could not run migrations (need SUPABASE_ACCESS_TOKEN + parseable project URL)');
  }

  // Write .env file
  const envFile = `deployment-${slug}.env`;
  const envContent = `# ${APP_NAME} deployment — ${orgName}
# Generated: ${new Date().toISOString()}

NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE=${supabaseServiceRoleKey}
ORG_ID=${orgIdStr}

# Add these as needed:
# ANTHROPIC_API_KEY=
# QB_CLIENT_ID=
# QB_CLIENT_SECRET=
# QB_REDIRECT_URI=
# QB_ENVIRONMENT=sandbox
# NEXT_PUBLIC_APP_URL=
`;

  fs.writeFileSync(envFile, envContent);
  console.log(`\nWrote ${envFile}`);

  // Write deployment checklist
  const dashboardUrl = projectRef === 'local'
    ? 'https://supabase.com/dashboard'
    : `https://supabase.com/dashboard/project/${projectRef}`;

  const appUrl = `[your Vercel URL]`;

  const firstLoginSection = sendInvite
    ? `## First Login
- Admin email: ${adminEmail}
- [ ] Check ${adminEmail} for the Supabase invite email
- [ ] Click invite link and set a password
- [ ] Load demo data if needed: /admin/console → Load Demo Data
- [ ] Configure QuickBooks if needed: /dashboard/settings/integrations`
    : `## First Login
- Admin email: ${adminEmail}
- Temporary password: ${tempPassword}
- [ ] Login and change password
- [ ] Load demo data if needed: /admin/console → Load Demo Data
- [ ] Configure QuickBooks if needed: /dashboard/settings/integrations`;

  const checklistContent = `# Deployment Checklist: ${orgName}

Generated: ${new Date().toISOString()}
Org ID: ${orgIdStr}

## Supabase Project
- Project URL: ${supabaseUrl}
- Anon Key: ${supabaseAnonKey || '[see deployment env file]'}
- Dashboard: ${dashboardUrl}

## Vercel Deployment
- [ ] Push repo to GitHub (or use existing)
- [ ] Create Vercel project, link to repo
- [ ] Add all env vars from \`${envFile}\`
- [ ] Deploy: \`vercel --prod\`
- [ ] Test login at ${appUrl}

${firstLoginSection}

## Handoff
- [ ] Share credentials with client
- [ ] Schedule training session
- [ ] Send HANDOFF.md to client IT contact
`;

  const checklistFile = `DEPLOYMENT_CHECKLIST-${slug}.md`;
  fs.writeFileSync(checklistFile, checklistContent);
  console.log(`Wrote ${checklistFile}`);

  console.log('\nDone! Summary:');
  console.log(`  Org ID:       ${orgIdStr}`);
  console.log(`  Admin User:   ${adminEmail} (${userId})`);
  console.log(`  Supabase URL: ${supabaseUrl}`);
  console.log(`  Env file:     ${envFile}`);
  console.log(`  Checklist:    ${checklistFile}`);
  if (tempPassword) {
    console.log(`  Temp password: ${tempPassword}  ← share securely with client`);
  }
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
