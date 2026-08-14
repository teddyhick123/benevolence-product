# Builder v2 — Config Completeness, Telemetry & GitHub PR Apply Path

**Date:** 2026-06-04
**Status:** Approved
**Scope:** Self-service org admin builder experience

---

## Problem

The Builder tab has three compounding gaps that make it unreliable for org admins:

1. **Config surface is incomplete and buggy.** `update_module_config` exposes a stale hardcoded enum (`['tax', 'donors', 'compliance', 'quickbooks']`) that doesn't match canonical module IDs. Six of ten modules are unreachable. There's no read tool so the AI can't check current state before making changes.

2. **Code proposals are a dead end.** `scaffold_module` generates files and advances to `ready_to_apply`, but there's no mechanism to write those files anywhere. The phase sits forever with no path forward for a non-developer admin.

3. **No observability.** There's no audit trail per org and no telemetry back to the platform team — no way to know what admins are trying to do or whether the builder is actually working for them.

---

## Approach

Three self-contained workstreams that can be built and shipped independently:

- **Track A:** Config tool fixes and expansion
- **Track B:** `builder_events` telemetry table and instrumentation
- **Track C:** GitHub PR apply path for code proposals

---

## Track A — Config Completeness

### Bug Fix: Module enum

`lib/builder/tools.ts:33` — the `update_module_config` tool's input schema has a hardcoded enum with 4 stale keys. Replace it with canonical, externally-facing `ModuleId` values from `lib/modules/types.ts`.

`list_modules` should return all 10 modules, including `core`, but `update_module_config` must not allow `core` to be toggled because it is always enabled.

Mutable module enum:

```
impact_tracking | reporting | tax_optimization | grant_management |
donor_management | pledge_tracking | external_data | analytics | compliance_regulatory
```

**Important schema rule:** the tool input uses canonical `ModuleId` values, but `organizations.modules` stores DB slugs (`tax`, `donors`, `reports`, `pledges`, `compliance`, `portfolio`, etc.). `update_module_config` must not write `[moduleId]: enabled` directly into `organizations.modules`. It must call `enableModule()` / `disableModule()` from `lib/modules` so dependency checks, core-module protection, and slug translation stay identical to the settings API.

### Security Fix: InputValidator

The existing builder tools cast inputs directly (`toolInput.module as string`) with no validation. All `executeTool()` cases must be updated to validate inputs via `InputValidator` from `lib/ai/validators.ts` before any DB write. This closes an injection risk on every tool call.

Pattern:
```typescript
case 'update_module_config': {
  InputValidator.validateRequired(toolInput.module, 'module');
  InputValidator.validateEnum(toolInput.module, 'module', MUTABLE_MODULE_IDS);
  InputValidator.validateRequired(toolInput.enabled, 'enabled');
  InputValidator.validateEnum(toolInput.enabled, 'enabled', [true, false]);

  const moduleId = toolInput.module as ModuleId;
  const enabled = toolInput.enabled as boolean;

  const result = enabled
    ? await enableModule(adminSupabase, orgId, moduleId, userId)
    : await disableModule(adminSupabase, orgId, moduleId);

  if (!result.success) return { type: 'error', tool: toolName, message: result.error ?? 'Module update failed' };
}
```

### New Tool: `list_modules`

Read-only. Returns all modules with their current enabled/disabled state for this org. The AI needs this before making any `update_module_config` call to avoid redundant toggles and to accurately report current state.

```typescript
{
  name: 'list_modules',
  description: 'List all available modules and their current enabled/disabled state for this org.',
  input_schema: { type: 'object', properties: {} },
}
```

Executor: call `getOrgEnabledModules(adminSupabase, orgId)`, merge with `MODULE_REGISTRY`, and return all modules with:

- `id`
- `name`
- `description`
- `enabled`
- `isCore`
- `dependencies`
- `canToggle` (`false` for `core`; false when disabling would break dependents)

Do not read raw `organizations.modules` in this tool unless you also normalize DB slugs through the same mapping used by `getOrgEnabledModules()`.

### New Tool: `update_workflow_template`

Allows org admins to customize grant workflow steps via the builder chat without a code proposal. Writes to the `workflow_templates` table — pure data-layer change.

```typescript
{
  name: 'update_workflow_template',
  description: 'Add, remove, or reorder steps in a grant workflow template.',
  input_schema: {
    type: 'object',
    properties: {
      template_id: { type: 'string', description: 'UUID of the workflow template' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'number' },
            required: { type: 'boolean' },
          },
          required: ['name', 'order'],
        },
        description: 'Complete ordered list of steps (replaces existing)',
      },
    },
    required: ['template_id', 'steps'],
  },
}
```

Executor scoping rules:

1. Validate `template_id` as a UUID.
2. Validate `steps` is an array and each item has bounded strings plus numeric `order`.
3. Fetch `workflow_templates.id, org_id, is_system, name, workflow_type, description, steps`.
4. If the template does not exist, return a not-found tool error.
5. If `org_id = orgId` and `is_system = false`, update that row's `steps`.
6. If `org_id IS NULL` or `is_system = true`, do **clone-on-write**:
   - insert a new org-owned template with the same `name`, `workflow_type`, and `description`
   - set `is_system = false`
   - set `org_id = orgId`
   - write the new `steps`
   - return the new `template_id`
7. If `org_id` belongs to another org, reject with a forbidden tool error.

This prevents service-role execution from mutating shared system templates or another org's templates.

### New Tool: `list_proposals`

Read-only. Lets the AI surface prior proposals so admins don't have to re-explain context for follow-up requests.

```typescript
{
  name: 'list_proposals',
  description: 'List recent builder proposals for this org, filtered by phase.',
  input_schema: {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        enum: ['pending', 'plan_ready', 'building', 'ready_to_apply', 'applied'],
        description: 'Filter by phase (optional — omit to return all)',
      },
    },
  },
}
```

### File changes (Track A)

| File | Change |
|------|--------|
| `lib/builder/tools.ts` | Fix module enum; add `InputValidator` calls to all cases; add `list_modules`, `update_workflow_template`, `list_proposals` definitions and executor cases |

---

## Track B — Telemetry & Audit Trail

### New table: `builder_events`

Migration: `db/migrations/0044_builder_events.sql`

```sql
CREATE TABLE public.builder_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id),
  event_type   text        NOT NULL
               CHECK (event_type IN (
                 'tool_call', 'ai_request',
                 'proposal_created', 'proposal_applied', 'proposal_rejected'
               )),
  tool_name    text,        -- non-null for tool_call events
  request_text text,        -- non-null for ai_request events
  payload      jsonb,       -- before/after state for config changes; proposal metadata for proposal events
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX builder_events_org_created_idx ON public.builder_events (org_id, created_at DESC);
CREATE INDEX builder_events_type_created_idx ON public.builder_events (event_type, created_at DESC);
```

**RLS:**
- Org admins `SELECT` their own org's rows (`is_org_admin(org_id)`)
- Service role: full access
- No authenticated `INSERT/UPDATE/DELETE` — only service role writes (prevents spoofing)

### Aggregate views (app admin only)

```sql
-- Cross-org tool usage frequency
CREATE OR REPLACE VIEW public.v_builder_tool_usage
WITH (security_invoker = true) AS
  SELECT tool_name, COUNT(*) AS call_count, COUNT(DISTINCT org_id) AS org_count
  FROM public.builder_events
  WHERE event_type = 'tool_call'
    AND public.is_app_admin()
  GROUP BY tool_name;

-- AI request corpus for product analysis
CREATE OR REPLACE VIEW public.v_builder_ai_requests
WITH (security_invoker = true) AS
  SELECT org_id, request_text, created_at
  FROM public.builder_events
  WHERE event_type = 'ai_request'
    AND public.is_app_admin()
  ORDER BY created_at DESC;
```

Both views must include the explicit `public.is_app_admin()` predicate above and should only be granted to `authenticated` if that predicate is present. Org admins can read raw `builder_events` only for their own org through table RLS; platform-wide telemetry views are app-admin-only.

### Instrumentation points

**1. `executeTool()` in `lib/builder/tools.ts`**

After each successful `case` block, before returning, emit a `tool_call` event via `adminSupabase`:

```typescript
await adminSupabase.from('builder_events').insert({
  org_id: orgId,
  user_id: userId,
  event_type: 'tool_call',
  tool_name: toolName,
  payload: { /* relevant before/after */ },
});
```

The `adminSupabase` client is already passed into `executeTool()` — no signature change needed.

**2. `POST /api/org/[orgId]/builder/chat/route.ts`**

At the top of the handler, after auth check, emit an `ai_request` event:

```typescript
await adminSupabase.from('builder_events').insert({
  org_id: orgId,
  user_id: user.id,
  event_type: 'ai_request',
  request_text: userMessage,
});
```

**3. Proposal lifecycle events**

Emitted from `executeTool()` cases for `submit_code_proposal` and `scaffold_module` (`proposal_created`), and from the apply endpoint (`proposal_applied`). Rejection is handled if/when a reject endpoint is added.

### File changes (Track B)

| File | Change |
|------|--------|
| `db/migrations/0044_builder_events.sql` | New migration |
| `lib/builder/tools.ts` | Add event emit after each successful tool case |
| `app/api/org/[orgId]/builder/chat/route.ts` | Add `ai_request` event emit at request start |

---

## Track C — GitHub PR Apply Path

### New env vars (per deployment instance)

```
GITHUB_TOKEN=ghp_...          # PAT or GitHub App token with repo scope
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=client-instance
```

These are set at deploy time per white-label instance. If any are absent, the "Open PR" button is hidden — graceful degradation with no errors.

### New file: `lib/builder/github-apply.ts`

Pure async function — no side effects beyond GitHub API calls:

```typescript
export interface ApplyResult {
  prUrl: string;
  branchName: string;
}

export async function applyProposalToGitHub(
  proposalId: string,
  moduleName: string,
  files: Array<{ path: string; content: string }>,
  reviewScore: number,
): Promise<ApplyResult>
```

**Implementation steps (in order):**
1. Read default branch SHA via `GET /repos/{owner}/{repo}/git/ref/heads/main`
2. Create branch `builder/scaffold-{proposalId.slice(0,8)}` via `POST /repos/{owner}/{repo}/git/refs`
3. For each file:
   - call `GET /repos/{owner}/{repo}/contents/{path}?ref={branchName}`
   - if the file exists and is a file, capture its `sha`
   - if the file returns `404`, treat it as a create
   - if GitHub returns any other error, fail the apply operation
   - call `PUT /repos/{owner}/{repo}/contents/{path}` with base64 content, branch name, commit message, and `sha` only when updating an existing file
4. Open PR via `POST /repos/{owner}/{repo}/pulls` with structured body (module name, file list, review score, AI-generated disclaimer)
5. Return `{ prUrl, branchName }`

Uses `fetch` directly — no new npm dependencies.

### New endpoint: `POST /api/org/[orgId]/builder/proposals/[proposalId]/apply`

```
Guards:  auth + is_org_admin + proposal.phase === 'ready_to_apply'
Action:  calls applyProposalToGitHub()
         updates proposal: status='applied', pr_url=<url>, phase='applied'
         emits proposal_applied builder_event
Returns: { prUrl }
```

Returns `409` if proposal is not in `ready_to_apply` phase (idempotency guard).
Returns `503` with `{ error: 'GitHub integration not configured' }` if env vars are absent.

### Retire old local apply endpoint

The existing local filesystem apply endpoint at `app/api/admin/builder/proposals/[proposalId]/apply/route.ts` must be removed or changed to return `410 Gone` with a message pointing to the org-scoped GitHub PR apply route.

Do not keep both apply paths active. Builder v2's only supported apply mechanism is "open a GitHub PR"; it must not write generated files directly into the running app filesystem.

### Schema addition

```sql
ALTER TABLE builder_proposals ADD COLUMN IF NOT EXISTS pr_url TEXT;
```

Add to `0026_builder_enhancement.sql` as a fold-in — per CLAUDE.md prerelease policy, patch columns belong in the canonical migration, not a separate file.

### UI change: `ReviewReportCard.tsx`

- Add "Open PR" button visible when `phase === 'ready_to_apply'` and `githubEnabled` prop is `true`
- On click: `POST .../apply`, show loading state, then replace button with "View PR on GitHub" link
- Pass `githubEnabled` from the settings server component through `BuilderTab` → `BuilderChat` → `ReviewReportCard`: `const githubEnabled = !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO_OWNER && process.env.GITHUB_REPO_NAME)` — no extra API route needed

**We do not auto-merge.** The PR always requires a human review and merge. This is a hard constraint.

### File changes (Track C)

| File | Change |
|------|--------|
| `lib/builder/github-apply.ts` | New file |
| `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts` | New endpoint |
| `components/settings/builder/ReviewReportCard.tsx` | Add "Open PR" button |
| `components/settings/BuilderTab.tsx`, `components/settings/BuilderChat.tsx` | Pass `githubEnabled` prop through to `ReviewReportCard` |
| `app/api/admin/builder/proposals/[proposalId]/apply/route.ts` | Delete or replace with `410 Gone` |
| `db/migrations/0026_builder_enhancement.sql` | Fold in `pr_url` column |

---

## What This Does Not Cover

- **Auto-merge / auto-deploy** — out of scope by design; always requires a human to merge the PR
- **Rollback of config changes** — the `builder_events` audit trail makes rollback possible to implement later, but the rollback action itself is not in this spec
- **Reject/undo proposal endpoint** — `builder_events` captures `proposal_rejected` but the UI trigger is not in scope here
- **Per-org GitHub config** — all instances share one GitHub integration; per-org OAuth is a future consideration if the platform moves to a multi-tenant SaaS model rather than per-client white-label deployments

---

## Implementation Order

1. Track B migration (`0044_builder_events.sql`) — no code deps, deploy first
2. Track A bug fix (module enum + InputValidator) — high priority, unblocks correct AI behavior
3. Track A new tools (`list_modules`, `update_workflow_template`, `list_proposals`)
4. Track B instrumentation (emit events from existing callsites)
5. Track C schema fold-in (`pr_url` in `0026_builder_enhancement.sql`) and retire local apply endpoint
6. Track C (`github-apply.ts` + org-scoped apply endpoint + `ReviewReportCard` button)

---

## Contract Tests To Add

- `update_module_config` accepts canonical mutable `ModuleId` values but calls `enableModule()` / `disableModule()` instead of writing raw module keys to `organizations.modules`.
- `core` appears in `list_modules` as enabled and `canToggle: false`, but is not accepted by `update_module_config`.
- `update_workflow_template` rejects cross-org templates and clone-on-writes system templates instead of updating them in place.
- Active migrations do not introduce duplicate migration numbers; builder events live in `0044_builder_events.sql`.
- `v_builder_tool_usage` and `v_builder_ai_requests` include explicit `public.is_app_admin()` predicates.
- `applyProposalToGitHub()` fetches existing file SHAs before updating files through the GitHub Contents API.
- The old admin local filesystem apply endpoint is deleted or returns `410 Gone`.
