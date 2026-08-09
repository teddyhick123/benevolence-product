# Impact Platform - Golden Template

A modular, white-label platform for philanthropic organizations. Clone this template to create customized instances for each client.

**Branding**: All branding is configured in `/lib/config/branding.ts` and environment variables. See `.env.example`.

## Database Schema Canon

**`db/migrations` is the single source of truth.** Any SQL outside that directory is stale and must not be treated as authoritative. When in doubt about a table name, column name, or function, read the relevant migration file.

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
- The `organization_modules` table does **not** exist. Module state lives in `organizations.modules` JSONB checked via `org_has_module(p_org_id, p_module)`; the parameter is `p_module`, not `p_module_id`.
- Module slugs in the database are `portfolio`, `donors`, `pledges`, `tax`, `compliance`, `reports`, `grant_management`, `impact_tracking`, `analytics`, `external_data`, `quickbooks`, `import`, and `ai_assistant`. App-facing aliases such as `core`, `donor_management`, `pledge_tracking`, `tax_optimization`, and `reporting` must map to those DB slugs.
- The canonical grant lifecycle parent is **`grants.id`** (migration 0041). `grant_details` is the old name — do not recreate it. `grant_milestones.grant_id`, `grant_reports.grant_id`, `grant_payments.grant_id`, `grant_decisions.grant_id`, `grant_status_history.grant_id`, and other grant ops tables reference `grants(id)`. `grants` carries `org_id` and `portfolio_id` directly; scope grant ops with `.eq('org_id', orgId)` on `grants` or via `grants!inner(org_id)` joins on child tables.
- Grant lifecycle stages (14-value CHECK on `grants.lifecycle_stage`): `draft`, `prospect`, `invited`, `application_received`, `due_diligence`, `recommended`, `approved`, `agreement`, `active`, `renewal_review`, `closeout`, `closed`, `declined`, `cancelled`. Use `lib/grants/lifecycle.ts` (`LIFECYCLE_STAGES`, `canTransition`, `transitionGrant`) to advance a grant — never update `lifecycle_stage` directly without recording `grant_status_history`.
- Org-scoped grant mutations live at `app/api/org/[orgId]/grants/**`. Do not create portfolio-scoped grant mutation routes.
- AI grant tools are implemented in `lib/ai/assistant/executors/grants.ts` and imported into `executor.ts`. Do not mark them with `feature_not_available`. Tools resolve `holding_id → grant_id` via `grantByHolding(supabase, holdingId)` before operating on child tables.
- Task mutations must preserve the transaction boundary in migration `0041`: use `create_task_with_relations`, `update_task_with_event`, `add_task_comment_with_event`, and `set_task_completion_state` through `lib/api/repositories/tasks.ts`. Generated tasks must use `lib/tasks/automation/task-writer.ts`, which delegates to `upsert_generated_task` and `settle_generated_tasks`. Never replace these with route/worker-level multi-write compensation. Task-completed automations are delivered through `task_automation_outbox`; consumers must remain retryable and idempotent.
- Organization AI routing uses `org_ai_connections`, service-only `org_ai_credentials`, `org_ai_deployments`, `org_ai_routes`, and `org_ai_route_targets` (migration 0057). Product surfaces request only a workload through `await gateway.resolve(workloadId)`; they never select connectors, credentials, endpoints, or raw model ids.
- Organization AI credentials are accessed only through `lib/api/repositories/ai-credentials.ts`. Never return credential rows, encrypted envelopes, fingerprints, or decrypted values to browser code, logs, audit metadata, execution plans, or errors.
- A missing organization route uses the code-owned platform workload default. A configured but invalid/disabled route fails closed. Platform-funded fallback occurs only when an explicit `platform_default` target is present in the snapshotted route.
- Durable assistant turns bind one immutable, non-secret `ai_turns.execution_plan` after `begin_ai_turn`. Replays return persisted messages/results without resolving or invoking again; preserve `(user_id, request_id)` idempotency and append-only `ai_messages`/`ai_actions` behavior.

## Documentation

| Document | Purpose |
|----------|---------|
| `AGENTS.md` (this file) | Quick reference for AI development |
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
| AI Tool Executors | `/lib/ai/assistant/executor.ts`, `/lib/ai/assistant/executors/` |
| AI Prompts/Context | `/lib/ai/assistant/prompts.ts`, `/lib/ai/assistant/context.ts` |
| AI Workloads/Gateway | `/lib/ai/workloads.ts`, `/lib/ai/runtime.ts`, `/lib/ai/gateway.ts` |
| AI Validators | `/lib/ai/validators.ts` |
| AI Types | `/lib/ai/types.ts` |
| Database Migrations | `/db/migrations/NNNN_description.sql` |
| API Routes | `/app/api/**/*.ts` |
| Components | `/components/**/*.tsx` |
| Browser Data Hooks | `/lib/<domain>/hooks.ts`, `/lib/api/client-hooks.ts` |
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
3. **Frontend**: Registered module metadata and authorized server/API data drive route and component visibility
4. **AI**: System prompt includes only enabled module instructions

---

## Creating a New Module

Use `/templates/module/README.md` and its tested templates as the implementation guide. The required sequence is:

1. Apply the Schema Change Decision Protocol. Organization-specific fields, KPIs, views, workflows, automations, and module choices stay in sanctioned data/configuration extension points. Only a genuine shared platform concept justifies canonical DDL.
2. Register the app-facing module ID and its database-slug mapping in `lib/modules/types.ts`, `lib/modules/client-info.ts`, and `lib/modules/registry.ts`.
3. If DDL is justified, use `db/migrations/NNNN_name.sql` for a product increment or edit the owning migration for a prerelease correction. Regenerate `lib/database.types.ts`.
4. Put elevated operations behind a tenant-scoped repository. Construct it only after `requireOrgAccess`, `requirePortfolioAccess`, or the appropriate public/job guard proves the principal and scope.
5. Put org-scoped mutations under `app/api/org/[orgId]/**`. Routes use shared access guards and `jsonOk`/`jsonError`; they do not construct feature-local service clients.
6. Put browser data ownership in `lib/<domain>/hooks.ts` and use `lib/api/client.ts` plus `lib/api/client-hooks.ts`. Components and client pages do not call raw `fetch`, parse JSON, or query Supabase directly for domain data.
7. Add provider-neutral AI definitions and small executors under `lib/ai/assistant/executors/tools/`. Elevated behavior enters through authenticated, tenant-scoped `AssistantToolCapabilities`, never an elevated client passed into the executor.
8. Preserve the assistant route's durable lifecycle: request-ID idempotency in `ai_turns`, normalized append-only `ai_messages`, persisted `ai_actions`, and atomic `begin_ai_turn`/`complete_ai_turn`/`fail_ai_turn` behavior.
9. Run `npm run verify:hygiene`, the focused boundary contracts, and the normal verification suite.

Do not recreate `contexts/ModuleContext.tsx` or a generic `ModuleGate`. Current module visibility is derived from registered module metadata and authorized server/API data, with explicit UI state passed to the relevant component.

---
## Tax Center Module

### Canonical Tax Center Tables

- `tax_profiles` — portfolio owner's tax filing context (filing status, state)
- `tax_years` — per-year actuals/planning: `adjusted_gross_income`, generated AGI limits, `standard_deduction`, contribution limit buckets, carryforward inputs, `filing_status`
- `tax_contributions` — individual charitable contributions; canonical columns include `contribution_date`, `tax_year`, `contribution_type`, `amount_usd`, `fmv_at_donation`, `cost_basis`, `recipient_name`, `recipient_ein`, `property_description`, `notes`, and `qcd_qualified`
- `holding_contributions` — join between `holdings` and `tax_contributions`
- `tax_carryforwards` — multi-year carryforward tracking; canonical columns are `amount`, `amount_remaining`, `originating_tax_year`, and `expires_tax_year`
- `tax_documents` — uploaded substantiation files
- `cpa_share_links` and `cpa_access_logs` — CPA collaboration links and access audit trail

### Dropped Tax Tables

- `owner_tax_profiles` is dropped and must not be recreated. The canonical AGI source is `tax_years.adjusted_gross_income`, with `tax_profiles.estimated_agi` only as a fallback.

### Canonical Contribution Types

`tax_contributions.contribution_type` and `daf_grants.contribution_type` accept exactly:

```text
cash | check | wire | stock | crypto | real_estate | other_property
```

Do not use stale values such as `other`, `ach`, `art`, or `vehicle`.

### Tax Documents

- Storage bucket: `tax-documents`
- The bucket is private (`public = false`)
- Upload/download routes must return signed URLs with `createSignedUrl`; never use `getPublicUrl` for tax documents

### Tax Views And Route Guards

Tax views must use `WITH (security_invoker = true)`. All Tax Center routes must still explicitly call `can_view_portfolio(p_portfolio_id)` or `can_edit_portfolio(p_portfolio_id)` before sensitive reads/writes so unauthorized callers receive a crisp 403 instead of empty data.

### CPA Sharing

- Schema lives in `db/migrations/0043_tax_cpa_sharing.sql`
- `cpa_share_links.share_token` stores only the SHA-256 hash of the raw bearer token; the raw token is shown once at creation and never persisted
- Public CPA access lives at `/tax/cpa/[token]` and `/api/tax/cpa/[token]/**`
- Public CPA endpoints are rate-limited by IP, validate links with hash comparison, enforce share permissions, increment `access_count`, and insert `cpa_access_logs` rows for views/downloads
- Revoke share links with `PATCH /api/portfolio/[id]/tax/cpa-share?share_link_id=...`; `DELETE` is only a compatibility alias

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
-- Check if user can view organization
public.can_view_org(p_org_id UUID) RETURNS BOOLEAN

-- Check if user is admin of organization
public.is_org_admin(org_id UUID) RETURNS BOOLEAN

-- Check if organization has module enabled
public.org_has_module(p_org_id UUID, p_module TEXT) RETURNS BOOLEAN

-- Get user's role in organization
public.user_org_role(p_org_id UUID) RETURNS TEXT
```

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
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
org_id UUID REFERENCES public.organizations(id)
portfolio_id UUID REFERENCES public.portfolios(id)
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### RLS Pattern
```sql
-- Read: members can read
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

All client-facing AI execution starts with a stable workload from
`lib/ai/workloads.ts` and enters through `lib/ai/runtime.ts` or an injected
`AIExecutionGateway`. Product routes, repositories, assistants, and module code
must not import `createAIProvider`, `AI_MODELS`, provider SDKs, or provider API
keys. Pass the organization and actor scope proven by the access/repository
boundary. Resolve one execution plan after `begin_ai_turn` and reuse it for the
entire durable assistant turn; replayed completed turns never invoke a model.

Builder, constructor, and scaffold workers are separate development tooling and
retain their dedicated provider/model configuration.

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
  /api              # Access guards, scoped repositories, responses, browser transport
  /modules          # Module system
    registry.ts     # Module definitions
    tool-filter.ts  # Tool filtering logic
    index.ts        # Exports
  /ai/assistant     # AI assistant internals: tools, executor, prompts, context
  /ai               # Provider abstraction, public assistant entrypoints, shared AI types
  /services         # External service integrations
  /schemas          # Zod validation schemas

/db/migrations      # Canonical database migrations (NNNN_name.sql)
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

## Simulated Walkthrough Testing

When asked to discover bugs through a simulated walkthrough:

1. Run `npm run walkthrough:doctor`, then `npm run walkthrough:reset`.
2. Choose a documented persona and mission from `/docs/walkthroughs/`.
3. Use the in-app Browser Use plugin to behave like a real user.
4. Inspect browser console errors, failed requests, HTTP 5xx responses, server output, and resulting local database state.
5. Test the happy path plus direct URL/API access, invalid input, interruption, repeated actions, stale tabs, and authorization boundaries.
6. Record reproducible findings using `/tests/walkthrough/BUG_TEMPLATE.md`.
7. When fixing a confirmed bug, add a Playwright regression test when practical, reset the baseline, and rerun the affected journey plus `npm run walkthrough:smoke`.

Walkthrough reset and seed commands must only target local Supabase. `db/migrations` remains the schema source of truth; do not create a second migration history for walkthrough tests.

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
- Database patterns: Check similar migrations in `/db/migrations/`
- Component patterns: Check similar components in `/components/`
