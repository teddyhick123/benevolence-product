# Impact Platform - Golden Template

A modular, white-label platform for philanthropic organizations. Clone this template to create customized instances for each client.

**Branding**: All branding is configured in `/lib/config/branding.ts` and environment variables. See `.env.example`.

## Database Schema Canon

**`db/migrations` is the single source of truth.** Any SQL outside that directory is stale and must not be treated as authoritative. When in doubt about a table name, column name, or function, read the relevant migration file — do not guess.

**The database is still prerelease.** No production/customer instances have run these migrations yet, so optimize the active migration set for the best long-term schema rather than preserving migration archaeology. Prefer consolidating duplicate tables, folding patch migrations into the canonical table definition, removing unused legacy schemas, and updating tests/docs to protect the new canon. Do not keep compatibility shims unless product code actively needs them or the user explicitly asks for backwards compatibility.

<!-- schema-change-protocol:start -->
### Schema Change Decision Protocol

Follow this protocol before changing a migration, generated database type, repository query, or any product shape that appears to need new storage.

1. **Inspect the canon first.** Read the owning files in `db/migrations`, then inspect `lib/database.types.ts` and the relevant repository. Do not infer schema from UI types, mocks, archived SQL, error messages, or documentation alone.
2. **Classify the requested field or behavior before writing DDL.**
   - A stable concept that the platform itself consumes across organizations — including reports, AI context, canonical views, shared workflows, or cross-org features — belongs in the owning canonical table.
   - Organization-specific, client-variable, or optional semantics belong in sanctioned data-driven extension points, never per-client DDL. Use `org_custom_field_definitions`/`org_custom_field_values`, `kpi_definitions`/`metric_facts`, `widgets`, `org_view_config`, `configurable_automations`, `workflow_config`, `organizations.modules`, or validated JSONB configuration as appropriate.
   - Schema-variable imports may exist only in the validated import-staging allowlist. Staging variability must be normalized into the platform canon or a sanctioned extension point before product code consumes it.
3. **Choose the migration shape deliberately.**
   - A prerelease correction to an existing concept must be folded into that concept's owning migration. Do not add an `ALTER TABLE ... ADD COLUMN` patch merely to repair the active prerelease migration set.
   - A genuine product increment with a newly introduced canonical concept gets a new numbered migration.
   - Builder may propose only new migration files, so Builder schema work is valid only for genuine product increments. Prerelease corrections that require editing an owning migration must be handled outside Builder.
4. **Preserve the typed access and repository boundaries.** Application code uses the generated `Database` type through `lib/database-client.ts` and repository modules. Do not restore feature-local Supabase structural casts, hand-maintained schema mirrors, or direct data access that bypasses the established repository boundary.
5. **Regenerate and verify.** Every migration change must be followed by `npm run db:types:generate`, and the resulting `lib/database.types.ts` must be committed with the migration. Run `npm run verify:migrations`; add or update behavioral assertions for affected constraints, RLS policies, grants, views, RPCs, concurrency, and idempotency. TypeScript compilation alone is not schema verification.
6. **Preserve durable AI conversation semantics.** `ai_sessions`, `ai_turns`, and `ai_messages` are the canonical assistant state. `ai_turns` provides the `(user_id, request_id)` idempotency boundary and `ai_messages` stores normalized append-only messages. Keep `begin_ai_turn`, `complete_ai_turn`, and `fail_ai_turn` as the atomic, retry-safe lifecycle; never replace it with session JSONB blobs, duplicate message writes, or check-then-insert logic that weakens at-most-once behavior.

`AGENTS.md` is canonical for this shared protocol. `CLAUDE.md` carries an identical marked copy for tools that read only that file; `tests/integration/agent-instructions-contract.test.ts` prevents the copies from diverging.
<!-- schema-change-protocol:end -->

Key invariants that differ from older patterns or documentation you may encounter elsewhere:
- All org-scoped tables use **`org_id`** (not `organization_id`) as the FK column name.
- The `organization_members` table uses **`org_id`** (not `organization_id`).
- The RLS helper for membership is **`can_view_org(p_org_id)`** (not `is_org_member`).
- The role lookup function is **`user_org_role(p_org_id)`** (not `org_role`).
- The app-level admin check is **`is_app_admin()`** (not `is_admin`).
- The `organization_holdings` table does **not** exist. Holdings belong to organizations directly through **`holdings.org_id`**, derived from the holding's portfolio.
- The `organization_modules` table does **not** exist. Module state lives in `organizations.modules` JSONB checked via `org_has_module(p_org_id, p_module)` — parameter is `p_module`, not `p_module_id`.
- Module slugs in the database: `portfolio`, `donors`, `pledges`, `tax`, `compliance`, `reports`, `grant_management`, `impact_tracking`, `analytics`, `external_data`, `quickbooks`, `import`, `ai_assistant`. Use these exact slugs with `org_has_module` unless an alias is defined in the function body (aliases: `pledge_tracking→pledges`, `donor_management→donors`, `tax_optimization→tax`, `compliance_regulatory→compliance`, `reporting→reports`, `core→portfolio`).
- The canonical grant lifecycle parent is **`grants.id`** (migration 0041). `grant_details` is the old name — do not recreate it. `grant_milestones.grant_id`, `grant_reports.grant_id`, `grant_payments.grant_id`, `grant_decisions.grant_id`, `grant_status_history.grant_id`, and other grant ops tables reference `grants(id)`. `grants` carries `org_id` and `portfolio_id` directly, so grant ops can be scoped with `.eq('org_id', orgId)` on the `grants` table or via `grants!inner(org_id)` joins on child tables.
- Grant lifecycle stages are the 14-value CHECK on `grants.lifecycle_stage`: `draft`, `prospect`, `invited`, `application_received`, `due_diligence`, `recommended`, `approved`, `agreement`, `active`, `renewal_review`, `closeout`, `closed`, `declined`, `cancelled`. Use `lib/grants/lifecycle.ts` (`LIFECYCLE_STAGES`, `canTransition`, `transitionGrant`) rather than raw SQL when advancing a grant.
- Org-scoped grant APIs live at `app/api/org/[orgId]/grants/**`. Do not create portfolio-scoped grant mutation routes — grant create/edit/transition belongs to the org scope. The portfolio-scoped `app/api/portfolio/[id]/grants` read route is retained for the portfolio dashboard widget.
- AI grant tools (`get_grant_health`, `track_milestone`, `record_grant_payment`, etc.) are wired in `lib/ai/assistant/executors/grants.ts` and imported into `executor.ts`. Do not mark them with `feature_not_available`. The grant helpers call `grantByHolding(supabase, holdingId)` to resolve holding_id → grant_id before operating on child tables.

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` (this file) | Quick reference for AI development |
| `/docs/ARCHITECTURE.md` | System architecture deep-dive |
| `/docs/MODULES.md` | Module system documentation |
| `/templates/module/README.md` | Module creation templates |

## Quick Reference

| What | Where |
|------|-------|
| Module Types | `/lib/modules/types.ts` |
| Module Client Info | `/lib/modules/client-info.ts` |
| Module Registry | `/lib/modules/registry.ts` |
| AI Assistant Entry | `/lib/ai/portfolio-assistant.ts` |
| AI Tool Definitions | `/lib/ai/assistant/tool-definitions.ts` |
| AI Tool Executors | `/lib/ai/assistant/executor.ts` |
| AI Prompts/Context | `/lib/ai/assistant/prompts.ts`, `/lib/ai/assistant/context.ts` |
| AI Validators | `/lib/ai/validators.ts` |
| AI Types | `/lib/ai/types.ts` |
| Database Migrations | `/db/migrations/NNNN_description.sql` |
| API Routes | `/app/api/**/*.ts` |
| Components | `/components/**/*.tsx` |
| Module Context | `/contexts/ModuleContext.tsx` |
| Templates | `/templates/module/` |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Organization                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Enabled Modules                          ││
│  │  ┌─────────┐ ┌─────────────┐ ┌───────────┐ ┌─────────────┐ ││
│  │  │  Core   │ │   Impact    │ │ Reporting │ │   Grants    │ ││
│  │  │ (always)│ │  Tracking   │ │           │ │ Management  │ ││
│  │  └─────────┘ └─────────────┘ └───────────┘ └─────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                     AI Assistant                            ││
│  │  • Tools filtered by enabled modules                        ││
│  │  • System prompt customized per org                         ││
│  │  • Actions tracked for undo/redo                            ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Portfolios                               ││
│  │  Holdings → Metrics → Widgets → Reports                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Module System

### Available Modules

| Module | Description | Dependencies |
|--------|-------------|--------------|
| `core` | Portfolio & holding management | Always enabled |
| `impact_tracking` | KPIs, metrics, visualizations | - |
| `reporting` | Reports, templates, exports | impact_tracking |
| `tax_optimization` | Tax scenarios, deductions | - |
| `grant_management` | Due diligence, workflows, payments | - |
| `donor_management` | Contributions, receipts, acknowledgments | - |
| `external_data` | Charity Navigator, Candid, news | - |
| `analytics` | Projections, benchmarks, risk, AI insights | impact_tracking |

### Module Definition Structure

```typescript
// /lib/modules/registry.ts
interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  isCore: boolean;
  icon: string;               // Heroicon name
  tools: string[];            // AI tool names this module provides
  tables: string[];           // Database tables this module owns
  routes: string[];           // Frontend routes this module provides
  dependencies?: ModuleId[];  // Required modules
  systemPromptAddition?: string; // Added to AI system prompt
}
```

### How Modules Work

1. **Database**: `organizations.modules` JSONB tracks which modules are enabled per org
2. **Backend**: `filterToolsForOrg()` filters AI tools based on enabled modules
3. **Frontend**: `ModuleGate` component conditionally renders based on modules
4. **AI**: System prompt includes only enabled module instructions

---

## Creating a New Module

### Step 1: Define the Module

Add to `/lib/modules/registry.ts`:

```typescript
new_module: {
  id: 'new_module',
  name: 'New Module',
  description: 'What this module does',
  isCore: false,
  icon: 'icon-name',
  tools: [
    'tool_name_1',
    'tool_name_2',
  ],
  tables: [
    'new_module_table',
  ],
  routes: [
    '/dashboard/new-module',
  ],
  dependencies: [], // or ['impact_tracking'] if needed
  systemPromptAddition: `
You can help with new module functionality. Available actions include:
- Action 1
- Action 2
`,
},
```

### Step 2: Create Database Migration

First apply the Schema Change Decision Protocol above. Prefer the existing data-driven extension points when the module is organization-variable. Only a genuine platform-level product increment should create `/db/migrations/NNNN_new_module.sql`; a prerelease correction must update its owning migration instead.

```sql
-- Migration: New Module Name
-- Description: Brief description
-- Date: YYYY-MM-DD

-- 1. CREATE TABLES
CREATE TABLE IF NOT EXISTS public.new_module_table (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Fields here
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_new_module_table_org_id
  ON public.new_module_table(org_id);

-- 3. ENABLE RLS
ALTER TABLE public.new_module_table ENABLE ROW LEVEL SECURITY;

-- 4. CREATE RLS POLICIES
-- Use can_view_org (member read) and is_org_admin (write). NOT is_org_member — that function does not exist.
CREATE POLICY "new_module_table_read" ON public.new_module_table
  FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

CREATE POLICY "new_module_table_write" ON public.new_module_table
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "new_module_table_service" ON public.new_module_table
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_module_table TO authenticated;
GRANT ALL ON public.new_module_table TO service_role;

-- 6. ADD updated_at TRIGGER
CREATE TRIGGER set_new_module_table_updated_at
  BEFORE UPDATE ON public.new_module_table
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
```

### Step 3: Add AI Tools

Add provider-neutral tool definitions to `/lib/ai/assistant/tool-definitions.ts`:

```typescript
// ==================== NEW MODULE ====================
{
  name: 'tool_name_1',
  description: 'Clear description of what this tool does',
  input_schema: {
    type: 'object',
    properties: {
      required_field: {
        type: 'string',
        description: 'Description for the AI'
      },
      optional_field: {
        type: 'number',
        description: 'Optional parameter (default: 10)'
      },
    },
    required: ['required_field'],
  },
},
```

Add the tool executor case in `executeAssistantTool()` in `/lib/ai/assistant/executor.ts`:

```typescript
case 'tool_name_1': {
  // Validate inputs
  InputValidator.validateUUID(args.required_field, 'required_field');

  // Execute operation
  const { data, error } = await supabase
    .from('new_module_table')
    .insert({ org_id: args.org_id, ... })
    .select()
    .single();

  if (error) throw error;

  // Return result (with optional action for undo/redo)
  return {
    action: {
      id: crypto.randomUUID(),
      sessionId,
      portfolioId,
      userId,
      actionType: 'create',
      entityType: 'new_entity_type', // Add to AIAction type if needed
      entityId: data.id,
      operationData: { table: 'new_module_table', after: data },
      aiReasoning: 'Created new item',
      userPrompt,
      status: 'applied',
      batchId,
      sequenceOrder,
    },
    output: { success: true, item: data },
  };
}
```

### Step 4: Create API Routes

Create `/app/api/org/[orgId]/new-module/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    // Auth check
    const cookieStore = await cookies();
    const supabase = createServerClient(/* ... */);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Module check (optional but recommended)
    const sb = supabaseService();
    const { data: hasModule } = await sb.rpc('org_has_module', {
      p_org_id: orgId,
      p_module: 'new_module',   // parameter is p_module, NOT p_module_id
    });
    if (!hasModule) {
      return NextResponse.json({ error: 'Module not enabled' }, { status: 403 });
    }

    // Fetch data
    const { data, error } = await sb
      .from('new_module_table')
      .select('*')
      .eq('org_id', orgId);

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### Step 5: Create Components

Create `/components/new-module/NewModuleList.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useModules } from '@/contexts/ModuleContext';

interface Props {
  orgId: string;
}

export default function NewModuleList({ orgId }: Props) {
  const { hasModule } = useModules();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasModule('new_module')) return;

    fetch(`/api/org/${orgId}/new-module`)
      .then(res => res.json())
      .then(data => setData(data.data || []))
      .finally(() => setLoading(false));
  }, [orgId, hasModule]);

  if (!hasModule('new_module')) {
    return null; // Or upgrade prompt
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Render data */}
    </div>
  );
}
```

### Step 6: Create Page

Create `/app/dashboard/new-module/page.tsx`:

```typescript
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import NewModuleList from '@/components/new-module/NewModuleList';

export default async function NewModulePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(/* ... */);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Get user's org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) redirect('/welcome');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">New Module</h1>
      <NewModuleList orgId={membership.org_id} />
    </div>
  );
}
```

---

## Tax Center Module

### Canonical Tax Center tables

- `tax_profiles` — portfolio owner's tax filing context (filing status, state)
- `tax_years` — per-year actuals/planning: `adjusted_gross_income`, generated AGI limits, `standard_deduction`, contribution limit buckets, carryforward inputs, `filing_status`
- `tax_contributions` — individual charitable contributions; canonical columns: `contribution_date`, `tax_year`, `contribution_type`, `amount_usd`, `fmv_at_donation`, `cost_basis`, `recipient_name`, `recipient_ein`, `property_description`, `notes`, `qcd_qualified`
- `holding_contributions` — M:M join between `holdings` and `tax_contributions`
- `tax_carryforwards` — multi-year carryforward tracking; canonical columns: `amount` (original), `amount_remaining`, `originating_tax_year`, `expires_tax_year`
- `daf_grants` — donor-advised fund grant records
- `foundation_990pf_data` — Form 990-PF data for private foundations
- `tax_documents` — uploaded substantiation files (receipts, acknowledgments, appraisals)
- `cpa_share_links` — CPA collaboration portal share links
- `cpa_access_logs` — append-only access log for CPA share activity

### Dropped tables (must not be recreated)

- `owner_tax_profiles` — **DROPPED** (migration 0012 tombstone). The canonical split is `tax_profiles` (filing context) + `tax_years` (per-year actuals). Do not recreate `owner_tax_profiles`.

### Canonical contribution types

The `contribution_type` column on `tax_contributions` and `daf_grants` accepts exactly these 7 values:

```
cash | check | wire | stock | crypto | real_estate | other_property
```

The old 4-value set (`cash`, `stock`, `crypto`, `other`) is stale — do not use it.

### Tax documents storage

- Bucket name: `tax-documents` (private, `public = false`)
- Always use `createAdminClient()` for storage operations (upload, `createSignedUrl`, remove). Never use the user-session client for storage — it causes an RLS deadlock because the storage policy needs the DB record that doesn't exist yet at upload time.
- Always return `signed_url` (from `createSignedUrl(path, 3600)`). Never call `getPublicUrl` for tax documents.

### Tax views (security invoker — not SECURITY DEFINER)

Views: `v_tax_contributions_enriched`, `v_tax_contributions_with_limits`, `v_tax_deduction_summary`, `v_portfolio_tax_summary`, `v_carryforward_schedule`, `v_active_carryforwards`

These views must be created with `WITH (security_invoker = true)`. Plain Postgres/Supabase views are not security-invoker by default and can bypass base-table RLS. Do NOT add `SECURITY DEFINER`.

`tax_contributions` canonically stores `deductible_amount` and exposes the generated stored column `fair_market_value` (derived from `fmv_at_donation`/`amount_usd`). `v_tax_contributions_enriched` additionally exposes computed fields such as `substantiation_requirement`, `substantiation_status`, `is_compliant`, and `calculated_deductible_amount`; do not duplicate those view-only fields as physical columns unless the schema is deliberately redesigned.

### CPA sharing

- Schema: `cpa_share_links` + `cpa_access_logs` (migration 0043)
- Always store `share_token` as a SHA-256 hash of the raw token. Never store the raw token.
- Public access lives at `/tax/cpa/[token]` and `/api/tax/cpa/[token]/**`.
- Public CPA endpoints are rate-limited by IP, validate links with hash comparison, enforce share permissions, increment `access_count`, and insert `cpa_access_logs` rows for views/downloads.
- Revoke share links with `PATCH /api/portfolio/[id]/tax/cpa-share?share_link_id=...`; `DELETE` is only a compatibility alias.

### AI tools and carryforward data source

- AGI source chain: `tax_years.adjusted_gross_income` → `tax_profiles.estimated_agi` → explicit error (never silently default)
- Carryforward data source: query `tax_carryforwards` directly. Never filter by `is_carryforward` on `tax_contributions` — that column is a legacy flag and must not be used as the primary data source.
- AI tax tools live in `lib/ai/assistant/executors/tax.ts`

### RLS helpers for tax routes

`can_view_portfolio(p_portfolio_id)` and `can_edit_portfolio(p_portfolio_id)` are defined in `db/migrations/0001_extensions_and_shared_infra.sql`. Use these (not `is_org_member`, which does not exist) in all portfolio-scoped tax API routes.

---

## Key Patterns

<!-- client-data-protocol:start -->
### Client Data Transport Canon

- Browser API traffic uses `lib/api/client.ts`. Use `requestJson` for ordinary JSON, `readJson` only when intentionally inspecting a raw response, and the named `uploadJson`, `requestDownload`, or `requestStream` helpers for non-JSON transports.
- Interactive GET state belongs in a domain hook under `lib/<domain>/hooks.ts`, backed by `lib/api/client-hooks.ts`. Components must not define local SWR fetchers or call raw `fetch`.
- Prefer server-component initial data when it is already available; use domain hooks for browser refresh and mutation revalidation. Do not introduce a second client cache.
- Generic browser/UI hooks live in `lib/hooks/`. The root `/hooks` directory must not be recreated.
- Client-provided org or portfolio identifiers are routing inputs, never authority. Do not add an authoritative `x-org-id` header; server guards and scoped repositories remain mandatory.
- AI streaming must use `requestStream` while preserving the stable client `requestId`, durable turn lifecycle, deterministic replay, and at-most-once tool side effects.
- Server-only upstream HTTP integrations and Builder verifier/GitHub transports are separate boundaries; do not force them through the browser client.
<!-- client-data-protocol:end -->

### Authentication & Authorization

```typescript
// Server-side auth check
const cookieStore = await cookies();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: '', ...options });
      },
    },
  }
);

const { data: { user } } = await supabase.auth.getUser();
```

### Database RLS Functions

```sql
-- Check if current user can VIEW the org (member or higher)
public.can_view_org(p_org_id UUID) RETURNS BOOLEAN

-- Check if current user can EDIT the org (admin or higher)
public.can_edit_org(p_org_id UUID) RETURNS BOOLEAN

-- Check if current user is an admin of the org
public.is_org_admin(p_org_id UUID) RETURNS BOOLEAN

-- Check if current user is the platform-level app admin
public.is_app_admin() RETURNS BOOLEAN

-- Get current user's role in org ('owner' | 'admin' | 'member' | 'viewer')
public.user_org_role(p_org_id UUID) RETURNS TEXT

-- Check if role is >= a minimum level
public.org_role_gte(p_org_id UUID, p_min_role TEXT) RETURNS BOOLEAN

-- Check if organization has module enabled (checks organizations.modules JSONB)
-- Parameter is p_module, NOT p_module_id
public.org_has_module(p_org_id UUID, p_module TEXT) RETURNS BOOLEAN
```

> **Note:** `is_org_member`, `org_role`, and `is_admin` do **not** exist. Use `can_view_org`, `user_org_role`, and `is_app_admin` respectively.

### API Response Patterns

```typescript
// Success
return NextResponse.json({ data: result });

// Error
return NextResponse.json({ error: 'Message' }, { status: 400 });

// With caching
return NextResponse.json(
  { data: result },
  { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' } }
);
```

### Styling with Tailwind

```typescript
// Brand colors
'text-azure'     // Primary blue #5186a6
'bg-azure'       // Primary blue background
'text-coral'     // Accent #e07a5f
'text-sunset'    // Warm accent #f4a261
'bg-creme'       // Background #fffff9

// Common patterns
'card'           // White bg, rounded, shadow
'shadow-soft'    // Subtle shadow (0 4px 16px rgba(0,0,0,0.05))
```

---

## Database Conventions

### Table Naming
- Plural nouns: `holdings`, `donations`, `grants`
- Junction tables: `portfolio_members`; module flags live in `organizations.modules`
- Snake_case for all names

### Common Columns
```sql
id         UUID        PRIMARY KEY DEFAULT gen_random_uuid()
org_id     UUID        REFERENCES public.organizations(id)   -- NOT organization_id
portfolio_id UUID      REFERENCES public.portfolios(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### RLS Pattern
```sql
-- Read: members can read (use can_view_org, NOT is_org_member — that function does not exist)
CREATE POLICY "table_read" ON public.table_name
  FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

-- Write: admins can write
CREATE POLICY "table_write" ON public.table_name
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Service role: full access
CREATE POLICY "table_service" ON public.table_name
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## AI Tool Development

### Tool Definition Best Practices

1. **Clear descriptions** - AI uses these to decide when to call tools
2. **Typed properties** - Use proper JSON Schema types
3. **Required fields** - Mark truly required fields
4. **Defaults noted** - Document default values in descriptions

```typescript
{
  name: 'action_verb_noun',  // e.g., 'create_holding', 'get_donor_summary'
  description: 'Start with action verb. Be specific about when to use.',
  input_schema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'string',
        description: 'UUID of the entity'
      },
      optional_param: {
        type: 'number',
        description: 'Description (default: 10)'
      },
    },
    required: ['entity_id'],
  },
},
```

### Tool Executor Best Practices

1. **Validate all inputs** using `InputValidator`
2. **Create action records** for undoable operations
3. **Return structured output** the AI can describe to users
4. **Handle errors gracefully** with meaningful messages

---

## File Organization

```
/app
  /api              # API routes
    /org/[orgId]    # Organization-scoped APIs
    /portfolio/[id] # Portfolio-scoped APIs
    /onboarding     # Onboarding APIs
  /dashboard        # Dashboard pages (protected)
  /onboarding       # Onboarding flow
  /login            # Auth pages

/components
  /analytics        # Analytics module components
  /donors           # Donor module components
  /grants           # Grant module components
  /onboarding       # Onboarding components
  /reports          # Reporting components
  /tax              # Tax module components
  /vis              # Visualization/widget components

/lib
  /modules          # Module system
    registry.ts     # Module definitions
    tool-filter.ts  # Tool filtering logic
    index.ts        # Exports
  /ai/assistant     # AI assistant internals: tools, executor, prompts, context
  /ai               # Provider abstraction, public assistant entrypoints, shared AI types
  /services         # External service integrations
  /schemas          # Zod validation schemas

/db                 # Database migrations (NNNN_name.sql)

/contexts           # React contexts
  ModuleContext.tsx # Module state management
```

---

## Testing Checklist

When creating a new module, verify:

- [ ] Module added to `MODULE_REGISTRY` in registry.ts
- [ ] Any new storage passed the Schema Change Decision Protocol (platform canon vs. data-driven extension)
- [ ] Migration placement is correct (owner migration for prerelease correction; new file for product increment)
- [ ] `lib/database.types.ts` was regenerated and committed for every migration change
- [ ] `npm run verify:migrations` passes from a clean local Supabase reset
- [ ] RLS policies correctly restrict access
- [ ] AI tools appear when module is enabled
- [ ] AI tools are filtered when module is disabled
- [ ] API routes check module access
- [ ] Components render only when module is enabled
- [ ] Routes are guarded by module access
- [ ] Undo/redo works for mutation tools

---

## Common Pitfalls

1. **Forgetting RLS policies** - Data will be inaccessible
2. **Not adding to registry** - Module won't appear anywhere
3. **Missing dependencies** - Module may not work correctly
4. **Tool name mismatch** - Tool won't be filtered properly
5. **No service_role policy** - API routes using service client will fail

---

## Getting Help

- Module system: `/lib/modules/registry.ts`
- AI patterns: `/lib/ai/portfolio-assistant.ts`, `/lib/ai/assistant/tool-definitions.ts`, `/lib/ai/assistant/executor.ts`
- Database patterns: Check similar migrations in `/db/`
- Component patterns: Check similar components in `/components/`
