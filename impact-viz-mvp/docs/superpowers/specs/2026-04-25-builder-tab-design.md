# Builder Tab Design

## Goal

Add a **Builder** tab to `/settings` where org owners and admins can customize their Benevolence instance through a combination of immediate config-layer changes and AI-generated code proposals. The tab features a live system visualization (left pane) and an AI chat coding agent (right pane), both integrated into the standard settings tab shell.

## Architecture

The Builder tab lives at `/settings/builder` inside the existing settings layout. It is a standard settings tab — the tab nav stays visible, navigation remains consistent.

The chat runs against a new API route (`/api/org/[orgId]/builder/chat`) backed by Claude with streaming responses and tool use. Claude operates in two modes:

- **Config tools** — Write directly to the DB. Changes are immediate and reversible.
- **Code proposal tool** — For anything beyond the config layer, Claude generates a code diff and writes it to `builder_proposals`. Client sees a "submitted for review" status card. Developer reviews and applies via `/admin/builder`.

Claude's context bundle on each request includes:
1. **Org snapshot** — name, type, active modules, integrations, team size, portfolio count, existing metric definitions, widget configs
2. **Codebase index** — pre-built at server startup, cached in a module-level singleton. Statically scanned (no LLM): all API routes (path + HTTP methods), all DB tables (name + columns from migration files), all components in `components/settings/`, `components/vis/`, and top-level `components/` (name + props summary), and `lib/` module exports. Refreshed on deploy.
3. **Conversation history** — last 20 messages from `builder_sessions` for this org

---

## File Layout

```
app/settings/builder/
  page.tsx                        — renders BuilderTab with org snapshot

app/api/org/[orgId]/builder/
  chat/route.ts                   — POST streaming chat, tool execution
  proposals/route.ts              — GET list proposals for org

app/admin/builder/
  page.tsx                        — admin review: list all proposals, approve/reject

components/settings/
  BuilderTab.tsx                  — split pane: SystemGraph (left) + BuilderChat (right)
  SystemGraph.tsx                 — React Flow read-only visualization
  BuilderChat.tsx                 — streaming chat UI, proposal cards, config result cards

lib/builder/
  codebase-index.ts               — startup scanner, module-level singleton
  context-bundle.ts               — assembles Claude context for each request
  tools.ts                        — Claude tool definitions + server-side executors
```

---

## Data Model

### New table: `builder_proposals`

```sql
CREATE TABLE builder_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  request_text    text NOT NULL,
  proposal_type   text NOT NULL
                  CHECK (proposal_type IN ('config', 'code')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  generated_code  jsonb,   -- { files: [{ path, content, diff }] }
  config_patch    jsonb,
  reviewer_notes  text,
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON builder_proposals (org_id, status);
CREATE INDEX ON builder_proposals (status, created_at DESC);
```

**RLS:** Org owners/admins can read their own org's proposals. Insert and status updates are via service role (API route uses `createAdminClient()`).

**Status flow:** `pending` → `approved` (developer reviewed) → `applied` (developer shipped). Or `pending` → `rejected`. The split between `approved` and `applied` lets you communicate acceptance to a client before the deploy ships.

### New table: `builder_sessions`

```sql
CREATE TABLE builder_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  messages    jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON builder_sessions (org_id, updated_at DESC);
```

**RLS:** Users can only read/write their own sessions. One active session per org user; upsert by (org_id, user_id).

---

## Builder Chat Tools

### Config tools (execute immediately via `createServerClient()`)

| Tool | Action |
|------|--------|
| `update_org_branding` | Updates logo URL and brand color in `organizations` |
| `update_dashboard_layout` | Writes widget order and visible sections to `widgets` table |
| `create_metric_definition` | Inserts a new row into `kpi_definitions` for the org |
| `update_module_config` | Patches the `modules` jsonb column on `organizations` |

### Proposal tool (writes to `builder_proposals` via `createAdminClient()`)

`submit_code_proposal` — `{ request_summary: string, files: [{ path: string, content: string, diff: string }] }`

Claude's system prompt instructs it to use config tools for anything achievable without modifying source files, and `submit_code_proposal` for anything requiring new or changed files. The codebase index is included in the system prompt so Claude knows what already exists before proposing changes.

---

## UI

### Builder Tab (`/settings/builder`)

Standard settings tab shell (tabs visible at top). Content area is a horizontal split:

**Left pane (40%) — System visualization**

Read-only React Flow graph. Nodes:
- Org node (center)
- Module nodes — one per module (Tax, Donors, Compliance, QuickBooks). Green if active, grey if disabled.
- Integration nodes — QuickBooks connection status, future connectors
- Team node — member count + role breakdown on hover
- Portfolio node — count of active portfolios

Edges connect each node to the org center. Hover tooltips show detail. No editing — informational only.

**Right pane (60%) — Builder chat**

Streaming markdown chat interface. Message history persisted to `builder_sessions`.

Inline result cards:
- **Config success card** — "Dashboard layout updated — changes are live." with a checkmark and undo option (where reversible)
- **Proposal card** — title, affected files list, status badge (Pending Review / Approved / Applied / Rejected), submitted date

### Admin Review Page (`/admin/builder`)

New page alongside `/admin/upload`. Lists all proposals across all orgs, newest first. Filterable by status.

Proposal card:
- Org name, request summary, submitted by (user email), date
- Expand to show per-file diffs (syntax-highlighted unified diff)
- Approve / Reject buttons + optional reviewer notes
- Separate "Mark as applied" action after shipping

---

## Codebase Index

Built by `lib/builder/codebase-index.ts` at server startup. No LLM involved — pure static analysis:

- **API routes:** Walk `app/api/` for `route.ts` files, extract HTTP methods and path
- **DB tables:** Parse `db/migrations/*.sql` for `CREATE TABLE` statements, extract table name and columns
- **Components:** Walk `components/` for `.tsx` files, extract default export name and prop types from TypeScript signatures
- **Lib modules:** Walk `lib/` for `.ts` files, extract named exports

Output is a compact JSON structure cached in a module singleton. Total size target: under 8KB so it fits comfortably in Claude's context window without dominating it. If the index exceeds 8KB, truncate to API routes + DB tables (highest signal for code generation).

**Degraded mode:** If the index fails to build (filesystem error, parse error), the chat route logs the error and continues without codebase context. Claude's system prompt notes the index is unavailable.

---

## Access Control

- `/settings/builder` — middleware guards to `owner` and `admin` roles (same as all settings routes)
- `/api/org/[orgId]/builder/chat` — checks `is_org_admin(org_id)` before processing
- `/api/org/[orgId]/builder/proposals` — checks `is_org_admin(org_id)` for reads
- `/admin/builder` — existing admin middleware (super-admin only, same as `/admin/upload`)

---

## Error Handling

- **Claude API failure** — surface error inline in chat, preserve message history, allow retry
- **Config tool DB error** — Claude receives the error text and explains it to the user in plain English; no partial state
- **Codebase index build failure** — Builder chat still works in degraded mode; system prompt notes unavailable context
- **Proposal submission failure** — Surface error in chat with retry option; do not lose the generated diff

---

## Navigation

`SettingsTabs.tsx` adds a 7th tab: **Builder** with a `Sparkles` icon (Lucide). Visible to owner and admin only (same visibility rule as all other settings tabs — enforced by the settings layout auth guard).

---

## Testing

- **Codebase index** — builds without error, contains expected routes, tables, and components
- **Config tools** — each tool writes correct data, changes are org-scoped, non-admin cannot call the route
- **Proposal creation** — `builder_proposals` row created with correct org_id, files array, status=pending
- **Proposal status transitions** — pending → approved → applied, pending → rejected all work; invalid transitions rejected
- **Auth guards** — non-admin cannot access `/settings/builder` or the chat API; non-super-admin cannot access `/admin/builder`
- **Session persistence** — messages saved to `builder_sessions`, loaded on next visit
- **System graph** — renders with correct nodes for active/inactive modules and integration state

---

## Future Path to Option C (Automated Deploy)

The `builder_proposals` table and review flow are designed to evolve into a fully automated pipeline when client deployments exist:

1. **Per-client repos** — each client's instance lives in a GitHub fork. Store `github_repo` + `github_install_id` on `organizations`.
2. **Automated PR** — on proposal approval, use GitHub API to create a branch + PR in the client's repo. Update `builder_proposals` with `pr_url`.
3. **Staging preview** — Vercel/Railway deploy preview fires on PR open. Store preview URL on the proposal.
4. **Client approval** — client approves in Builder tab → merges PR → triggers production deploy.

No changes to `builder_proposals` schema needed — `generated_code.files` already has everything required to create a PR diff.
