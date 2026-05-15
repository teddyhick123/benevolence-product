#!/usr/bin/env ts-node
/**
 * Client handoff package generator
 *
 * Usage:
 *   npx ts-node scripts/export-client-package.ts --org-name "Foundation Name" --slug foundation-name
 *
 * Creates: handoff-[slug].zip containing:
 *   - Full source code (excluding node_modules, .next, .git)
 *   - All SQL migrations
 *   - Environment template (.env.template)
 *   - docs/ directory
 *   - HANDOFF.md with client-specific instructions
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Impact Platform';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(): { orgName: string; slug: string } {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${APP_NAME} Client Handoff Package Generator

Usage:
  npx ts-node scripts/export-client-package.ts \\
    --org-name "Foundation Name" \\
    --slug foundation-name

Options:
  --org-name   Display name of the organization (required)
  --slug       URL-safe slug for filenames (required)
  --help       Show this help

Creates:
  handoff-[slug].zip   Zip archive for client handoff
`);
    process.exit(0);
  }

  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const orgName = get('--org-name');
  const slug = get('--slug');

  if (!orgName) { console.error('Missing --org-name'); process.exit(1); }
  if (!slug) { console.error('Missing --slug'); process.exit(1); }

  return { orgName, slug };
}

// ---------------------------------------------------------------------------
// Generate HANDOFF.md
// ---------------------------------------------------------------------------
function generateHandoff(orgName: string): string {
  return `# ${APP_NAME} — Client Handoff: ${orgName}

Welcome to your ${APP_NAME} installation. This package contains everything you need to own and operate your philanthropic management platform.

## What You Own
- Full Next.js 15 source code (TypeScript)
- All database migrations (PostgreSQL via Supabase)
- All documentation

## Your Deployment
- **Application URL:** [to be filled after deployment]
- **Supabase Dashboard:** [to be filled]
- **Admin Email:** [to be filled]

## Getting Help
For technical questions about your installation, contact your implementation partner.

## Setup Instructions
See docs/GETTING_STARTED.md for full setup instructions.

## Your Data
Your data is stored exclusively in your Supabase project. No data is shared with any third party. You can export your entire database at any time from the Supabase dashboard.

## Making Changes
Your team (or a hired developer) can modify any part of this codebase. The code is documented and follows standard Next.js conventions. See docs/USER_GUIDE.md for feature documentation.
`;
}

// ---------------------------------------------------------------------------
// Generate .env.template
// ---------------------------------------------------------------------------
function generateEnvTemplate(): string {
  return `# ${APP_NAME} Environment Variables
# Copy this file to .env.local and fill in your values.
# Never commit .env.local to version control.

# ── Branding ────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_NAME=${APP_NAME}

# ── Supabase (required) ─────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE=YOUR_SERVICE_ROLE_KEY

# ── Organization ─────────────────────────────────────────────────────────────
ORG_ID=YOUR_ORG_UUID

# ── AI Assistant (required for AI features) ──────────────────────────────────
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_API_KEY

# ── QuickBooks Integration (optional) ────────────────────────────────────────
QB_CLIENT_ID=
QB_CLIENT_SECRET=
QB_REDIRECT_URI=https://YOUR_DOMAIN/api/integrations/quickbooks/callback
QB_ENVIRONMENT=sandbox

# ── App URL ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN

# ── Google Maps (optional, for holdings map) ─────────────────────────────────
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const { orgName, slug } = parseArgs();

  console.log(`\nPackaging handoff for: ${orgName}`);
  console.log(`Slug: ${slug}\n`);

  // Resolve project root (one level up from scripts/)
  const scriptDir = path.dirname(__filename);
  const projectRoot = path.resolve(scriptDir, '..');

  // Write HANDOFF.md into project root temporarily
  const handoffPath = path.join(projectRoot, 'HANDOFF.md');
  fs.writeFileSync(handoffPath, generateHandoff(orgName));
  console.log('Wrote HANDOFF.md');

  // Write .env.template
  const envTemplatePath = path.join(projectRoot, '.env.template');
  fs.writeFileSync(envTemplatePath, generateEnvTemplate());
  console.log('Wrote .env.template');

  const zipFile = `handoff-${slug}.zip`;

  // Exclusions for zip
  const excludePatterns = [
    'node_modules',
    '.next',
    '.git',
    '*.env',
    '*.env.local',
    '.env.*',
    `handoff-${slug}.zip`,
    'deployment-*.env',
    'DEPLOYMENT_CHECKLIST-*.md',
  ].map(p => `--exclude="${p}/*" --exclude="${p}"`).join(' ');

  // Build zip command — exclude patterns need to be passed carefully
  const excludeArgs = [
    'node_modules/*',
    '.next/*',
    '.git/*',
    '*.env',
    '*.env.local',
    `.env.*`,
    `handoff-${slug}.zip`,
    'deployment-*.env',
  ].map(p => `-x "${p}"`).join(' ');

  const zipCmd = `cd "${projectRoot}" && zip -r "${path.resolve(zipFile)}" . ${excludeArgs}`;

  console.log(`Creating ${zipFile}…`);
  try {
    execSync(zipCmd, { stdio: 'inherit', shell: '/bin/bash' });
  } finally {
    // Clean up temp files added to root
    fs.unlinkSync(handoffPath);
    fs.unlinkSync(envTemplatePath);
  }

  const stat = fs.statSync(zipFile);
  const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
  console.log(`\nDone! Created ${zipFile} (${sizeMb} MB)`);
  console.log('\nPackage contents:');
  console.log('  - Source code (Next.js 15 / TypeScript)');
  console.log('  - db/  (all SQL migrations)');
  console.log('  - docs/ (documentation)');
  console.log('  - .env.template');
  console.log('  - HANDOFF.md');
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
