# Builder Enhancement — Sprint C Design Spec

**Date:** 2026-04-30
**Status:** Approved

## Goal

Extend the Builder tab into a full deployment customization surface: per-org AI assistant instructions injected into every chat session, expanded KPI management tools, and a professional-grade three-phase module scaffolding pipeline (plan → build → review) backed by a BullMQ async worker.

---

## Scope

Three pieces, delivered together:

1. **Per-org AI instructions** — Builder tool writes to a new `organizations.ai_instructions` column; injected into every main assistant chat session for that org.
2. **Expanded Builder tools** — KPI read/edit/delete tools (currently create-only), plus org name added to `update_org_branding`.
3. **Three-phase module scaffold** — `scaffold_module` tool drives a plan → build → review pipeline with rich context harness, BullMQ async worker for the build phase, and phase-aware UI cards.

---

## Data Layer

### Migration: `organizations.ai_instructions`

```sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_instructions TEXT;
```

Nullable. Written by the `set_ai_instructions` Builder tool. Read at the start of every main assistant chat session in `lib/claude-assistant.ts`.

### Migration: `builder_proposals` phase columns

```sql
ALTER TABLE public.builder_proposals
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS plan_content JSONB;
```

**Phase state machine:**
```
planning → plan_ready → building → build_ready → reviewing → ready_to_apply → applied
```

Existing `status` column (`pending | approved | rejected | applied`) is preserved for the existing proposal review UI. New scaffold proposals use `phase` as the primary lifecycle field.

`plan_content` shape:
```typescript
{
  moduleName: string;       // e.g. "Volunteer Tracking"
  moduleSlug: string;       // e.g. "volunteer_tracking"
  moduleIcon: string;       // heroicon name
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  files: Array<{
    path: string;           // relative to project root
    description: string;    // what this file does
  }>;
  registryEntry: string;    // draft registry block
  apiShape: string;         // fields exposed, computed columns
}
```

---

## AI Provider Abstraction

### New files

**`lib/ai/types.ts`** — shared types (`AIMessage`, `AIResponse`, `AIStreamChunk`, `ToolDefinition`, `ContentBlock`). Mirrors Anthropic SDK shapes but provider-agnostic.

**`lib/ai/provider.ts`** — interface:
```typescript
export interface AIRequestConfig {
  model: string;
  system?: string;
  messages: AIMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface AIProvider {
  createMessage(config: AIRequestConfig): Promise<AIResponse>;
  createStream(config: AIRequestConfig): AsyncIterable<AIStreamChunk>;
}
```

**`lib/ai/providers/anthropic.ts`** — `AnthropicProvider implements AIProvider`. Wraps existing `@anthropic-ai/sdk`. Maps `AIRequestConfig` to Anthropic SDK params.

**`lib/ai/factory.ts`** — `createAIProvider()` reads `AI_PROVIDER` env var (default: `'anthropic'`), returns the right implementation. Adding OpenAI or Gemini is one new class + one switch case.

**`lib/ai/models.ts`** — per-phase model config:
```typescript
export const AI_MODELS = {
  assistant:       process.env.AI_MODEL_ASSISTANT        ?? 'claude-sonnet-4-6',
  scaffoldPlan:    process.env.AI_MODEL_SCAFFOLD_PLAN    ?? 'claude-opus-4-7',
  scaffoldBuild:   process.env.AI_MODEL_SCAFFOLD_BUILD   ?? 'claude-sonnet-4-6',
  scaffoldReview:  process.env.AI_MODEL_SCAFFOLD_REVIEW  ?? 'claude-opus-4-7',
} as const;
```

### Migration of existing callers

`lib/claude-assistant.ts` and `app/api/org/[orgId]/builder/chat/route.ts` both currently instantiate `new Anthropic()` directly. Both get migrated to use `createAIProvider()` + `AI_MODELS.assistant` in this sprint. The scaffold worker uses the abstraction from day one.

---

## New Builder Tools

Added to `lib/builder/tools.ts`:

### `set_ai_instructions`
Writes `instructions` string to `organizations.ai_instructions` for the current org. Injected at main assistant chat start.

### `list_kpi_definitions`
Reads all `kpi_definitions` rows for the org. Returns id, name, slug, unit, description, aggregation, direction, is_active, display_order.

### `update_metric_definition`
Edits name, unit, description, aggregation, direction, or display_order on an existing KPI by id.

### `delete_metric_definition`
Soft-deletes (sets `is_active = false`) a KPI by id. Historical `metric_facts` rows are preserved.

### `scaffold_module`
Takes a plain-English description. Creates a `builder_proposals` row in `phase: 'planning'`, runs Phase 1 (plan generation), transitions to `plan_ready`, returns proposal id. Chat UI renders Plan Card.

### `update_org_branding` (extended)
Adds optional `name` field so org name and branding can be updated in a single tool call.

---

## Scaffold Context Harness

`lib/builder/scaffold-context.ts` assembles the context bundle for scaffold phases:

| Content | Source | When included |
|---------|--------|---------------|
| Full template files | `templates/module/*` (read verbatim) | Phase 1, Phase 2 |
| Worked example module | `donors` migration + route + component + registry entry | Phase 1, Phase 2 |
| CLAUDE.md key sections | Auth pattern, RLS pattern, API conventions, Tailwind tokens (~1KB excerpt) | Phase 1, Phase 2 |
| Next migration number | `Math.max(...scan db/migrations/) + 1`, formatted `NNNN` | Phase 1, Phase 2 |
| Codebase index | Existing 8KB budget from `lib/builder/codebase-index.ts` | Phase 1, Phase 2 |
| `plan_content` | Approved plan from Phase 1 | Phase 2, Phase 3 |
| All generated files | `generated_code.files` | Phase 3 only |

---

## Three-Phase Scaffold Flow

### Phase 1 — Planning (synchronous, in Builder chat route)

1. `scaffold_module(description)` called by Builder AI
2. Single Claude call (model: `AI_MODELS.scaffoldPlan`) with full context harness + admin description
3. Model returns structured `plan_content` JSON
4. Proposal created/updated: `phase → plan_ready`, `plan_content` stored
5. Chat UI renders **Plan Card**
6. Admin reviews; can request changes (free-text → another planning round-trip) or approve
7. Approval: `POST /api/org/[orgId]/builder/proposals/[id]/build`

### Phase 2 — Building (BullMQ async worker)

1. Build endpoint dispatches `scaffold-build` job to BullMQ
2. Proposal: `phase → building`
3. Worker processes files sequentially (one Claude call per file, model: `AI_MODELS.scaffoldBuild`):
   - `NNNN_<slug>.sql` — migration
   - `lib/modules/registry.ts` — registry block insertion
   - `app/api/org/[orgId]/<slug>/route.ts` — GET + POST route
   - `components/<slug>/<Module>List.tsx` — list component
   - `app/dashboard/<slug>/page.tsx` — dashboard page
4. Each file appended to `generated_code.files` as it completes
5. Worker emits BullMQ progress after each file (0–100)
6. Chat UI polls `/api/admin/jobs/[jobId]` (2s interval), updates **Build Progress Card**
7. On completion: `phase → build_ready`, review job auto-dispatched

### Phase 3 — Review (BullMQ, triggered automatically by build worker)

1. Single Claude call (model: `AI_MODELS.scaffoldReview`) with all generated files + `plan_content`
2. Model checks for: missing auth guards, RLS policy gaps, naming inconsistencies, type mismatches
3. Returns: `{ score: number (0–100), findings: Array<{ severity, description }> }`
4. Stored on proposal; `phase → ready_to_apply`
5. Chat UI renders **Review Report Card**

### Apply

`POST /api/admin/builder/proposals/[id]/apply`:
- Auth: super-admin only
- Reads `generated_code.files` array
- Writes each file to its path relative to project root using `fs.writeFileSync`
- Does not run `git add/commit` — developer handles git
- `phase → applied`

---

## Phase-Aware UI Cards

New components in `components/settings/builder/`:

### `PlanCard.tsx`
Rendered when `phase === 'plan_ready'`. Shows: module name, table schema, file list. Actions: "Request changes" (text input → chat), "Approve Plan" (triggers build endpoint).

### `BuildProgressCard.tsx`
Rendered when `phase === 'building'`. Polls `/api/admin/jobs/[jobId]` every 2s. Shows file-by-file checklist with status icons (pending / in-progress / done / error). Auto-transitions to showing the Review Report Card when build completes.

### `ReviewReportCard.tsx`
Rendered when `phase === 'reviewing' | 'ready_to_apply'`. Shows confidence score (color-banded: green ≥80, amber 60–79, red <60), findings list (collapsed by default if score ≥80), and "View full diff →" link to `/admin/builder`.

All three imported into `BuilderChat.tsx` and rendered by proposal phase alongside existing card types.

---

## ai_instructions Injection

In `lib/claude-assistant.ts`, at session start, read `org.ai_instructions` from the organizations row and prepend to the system prompt:

```
${ai_instructions ? `\n\nOrg-specific instructions:\n${ai_instructions}\n\n` : ''}
```

Applied to every main assistant chat session. Builder sessions are not affected (they have their own system prompt).

---

## Files Created / Modified

| File | Action |
|------|--------|
| `db/migrations/0025_builder_enhancement.sql` | Create — `ai_instructions` column + `builder_proposals` phase columns |
| `lib/ai/types.ts` | Create — shared provider-agnostic AI types |
| `lib/ai/provider.ts` | Create — `AIProvider` interface |
| `lib/ai/providers/anthropic.ts` | Create — `AnthropicProvider` implementation |
| `lib/ai/factory.ts` | Create — `createAIProvider()` factory |
| `lib/ai/models.ts` | Create — per-phase model config |
| `lib/builder/scaffold-context.ts` | Create — context harness assembler |
| `lib/builder/scaffold-worker.ts` | Create — BullMQ worker (phases 2 + 3) |
| `lib/builder/tools.ts` | Modify — add 5 new tools, extend `update_org_branding` |
| `lib/claude-assistant.ts` | Modify — inject `ai_instructions`, migrate to `AIProvider` |
| `app/api/org/[orgId]/builder/chat/route.ts` | Modify — migrate to `AIProvider` |
| `app/api/org/[orgId]/builder/proposals/[id]/build/route.ts` | Create — dispatch build job |
| `app/api/admin/builder/proposals/[id]/apply/route.ts` | Create — write files to disk |
| `components/settings/builder/PlanCard.tsx` | Create |
| `components/settings/builder/BuildProgressCard.tsx` | Create |
| `components/settings/builder/ReviewReportCard.tsx` | Create |
| `components/settings/BuilderChat.tsx` | Modify — render phase-aware cards |

---

## Out of Scope

- Full provider swap (OpenAI, Gemini) — interface is in place, implementations deferred
- Auto-git-commit on apply — developer handles git
- Separate "Assistant" settings tab — Builder is the single surface
- Phase state machine for existing (non-scaffold) proposals — they keep `status` lifecycle
