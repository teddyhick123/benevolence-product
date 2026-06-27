# Builder Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Builder tab to `/settings` with a system visualization (left) and an AI chat coding agent (right) — Claude can apply immediate config changes or submit code proposals for developer review.

**Architecture:** Two new DB tables (`builder_proposals`, `builder_sessions`) back the feature. A lazy-init codebase index singleton gives Claude structural awareness of the app. The chat route streams SSE events carrying text chunks, tool results, and proposal cards. The UI is a split-pane inside the existing settings tab shell.

**Tech Stack:** Next.js 15 App Router, Anthropic SDK (claude-sonnet-4-6, streaming + tool use), Supabase (RLS), SSE via `ReadableStream`, custom SVG graph (no new dependencies), Tailwind CSS.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `db/migrations/0025_builder.sql` | Create | `builder_proposals` + `builder_sessions` tables + RLS |
| `lib/builder/codebase-index.ts` | Create | Lazy-init singleton; scans filesystem for routes, tables, components |
| `lib/builder/context-bundle.ts` | Create | Assembles Claude's system prompt from org snapshot + codebase index |
| `lib/builder/tools.ts` | Create | Anthropic tool definitions + server-side executors |
| `app/api/org/[orgId]/builder/chat/route.ts` | Create | POST streaming SSE; orchestrates Claude tool loop |
| `app/api/org/[orgId]/builder/proposals/route.ts` | Create | GET list proposals for org |
| `app/api/admin/builder/proposals/[proposalId]/route.ts` | Create | PATCH status (approved / rejected / applied) |
| `app/settings/builder/page.tsx` | Create | Server page; fetches org snapshot; renders BuilderTab |
| `app/admin/builder/page.tsx` | Create | Admin review page; lists all proposals across all orgs |
| `components/settings/BuilderTab.tsx` | Create | Split-pane shell: SystemGraph + BuilderChat |
| `components/settings/SystemGraph.tsx` | Create | Read-only SVG radial graph of org deployment state |
| `components/settings/BuilderChat.tsx` | Create | Streaming chat UI; proposal cards; config success cards |
| `components/settings/SettingsTabs.tsx` | Modify | Add Builder tab (7th tab) |

---

## Task 1: DB Migration

**Files:**
- Create: `db/migrations/0025_builder.sql`

- [ ] **Step 1: Write the migration**

```sql
-- db/migrations/0025_builder.sql
-- Builder Tab: builder_proposals, builder_sessions
-- Depends on: 0001-0024

-- ---------------------------------------------------------------------------
-- builder_proposals — stores code and config proposals from the Builder chat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by    uuid NOT NULL REFERENCES auth.users(id),
  request_text    text NOT NULL,
  proposal_type   text NOT NULL
                  CHECK (proposal_type IN ('config', 'code')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  generated_code  jsonb,
  -- { files: [{ path: string, content: string, diff: string }] }
  config_patch    jsonb,
  reviewer_notes  text,
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_proposals_org_status_idx
  ON builder_proposals (org_id, status);
CREATE INDEX IF NOT EXISTS builder_proposals_status_created_idx
  ON builder_proposals (status, created_at DESC);

ALTER TABLE builder_proposals ENABLE ROW LEVEL SECURITY;

-- Org admins can read their own org's proposals
CREATE POLICY "org admins can read builder proposals"
  ON builder_proposals FOR SELECT
  USING (is_org_admin(org_id));

-- Insert and updates only via service role (admin client)

-- ---------------------------------------------------------------------------
-- builder_sessions — persists Builder chat history per org+user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  messages    jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS builder_sessions_org_updated_idx
  ON builder_sessions (org_id, updated_at DESC);

ALTER TABLE builder_sessions ENABLE ROW LEVEL SECURITY;

-- Users can read and write only their own session
CREATE POLICY "users can manage own builder session"
  ON builder_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Run in Supabase**

Open the Supabase dashboard → SQL Editor → paste the file contents → Run. Verify both tables appear in Table Editor with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0025_builder.sql
git commit -m "feat: add builder_proposals and builder_sessions migration"
```

---

## Task 2: Codebase Index

**Files:**
- Create: `lib/builder/codebase-index.ts`

This module scans the filesystem statically (no LLM) and caches the result in a module-level singleton. It gives Claude structural awareness of the codebase so it can reference real file paths and table names when generating proposals.

- [ ] **Step 1: Create the file**

```typescript
// lib/builder/codebase-index.ts
import fs from 'fs';
import path from 'path';

export interface CodebaseIndex {
  apiRoutes: Array<{ path: string; methods: string[] }>;
  dbTables: Array<{ name: string; columns: string[] }>;
  components: Array<{ name: string; file: string }>;
  libModules: Array<{ file: string; exports: string[] }>;
  builtAt: string;
}

let _index: CodebaseIndex | null = null;

export function getCodebaseIndex(): CodebaseIndex {
  if (_index) return _index;
  _index = buildIndex();
  return _index;
}

function buildIndex(): CodebaseIndex {
  const root = process.cwd();
  return {
    apiRoutes: scanApiRoutes(path.join(root, 'app', 'api')),
    dbTables: scanDbTables(path.join(root, 'db', 'migrations')),
    components: scanComponents(path.join(root, 'components')),
    libModules: scanLibModules(path.join(root, 'lib')),
    builtAt: new Date().toISOString(),
  };
}

function scanApiRoutes(dir: string): Array<{ path: string; methods: string[] }> {
  const results: Array<{ path: string; methods: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string, routePath: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Convert [param] to :param for readability
        const segment = entry.name.replace(/^\[(.+)\]$/, ':$1');
        walk(path.join(current, entry.name), `${routePath}/${segment}`);
      } else if (entry.name === 'route.ts') {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
          .filter(m => new RegExp(`export async function ${m}\\b`).test(content));
        if (methods.length > 0) {
          results.push({ path: routePath, methods });
        }
      }
    }
  }

  walk(dir, '/api');
  return results;
}

function scanDbTables(dir: string): Array<{ name: string; columns: string[] }> {
  const results: Array<{ name: string; columns: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    // Match CREATE TABLE [IF NOT EXISTS] table_name (
    const tableMatches = content.matchAll(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi
    );
    for (const match of tableMatches) {
      const tableName = match[1];
      const body = match[2];
      // Extract column names (lines starting with an identifier, not CONSTRAINT/INDEX/PRIMARY/UNIQUE/CHECK/FOREIGN)
      const columns = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|CREATE|--)/i.test(l))
        .map(l => l.split(/\s+/)[0].replace(/,?$/, ''))
        .filter(name => /^\w+$/.test(name));
      results.push({ name: tableName, columns });
    }
  }

  return results;
}

function scanComponents(dir: string): Array<{ name: string; file: string }> {
  const results: Array<{ name: string; file: string }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name));
      } else if (entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const match = content.match(/export default function (\w+)/);
        if (match) {
          const relPath = path.relative(process.cwd(), path.join(current, entry.name));
          results.push({ name: match[1], file: relPath });
        }
      }
    }
  }

  walk(dir);
  return results;
}

function scanLibModules(dir: string): Array<{ file: string; exports: string[] }> {
  const results: Array<{ file: string; exports: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const exportMatches = content.matchAll(/export (?:async function|function|const|class|type|interface) (\w+)/g);
        const exports = [...exportMatches].map(m => m[1]);
        if (exports.length > 0) {
          const relPath = path.relative(process.cwd(), path.join(current, entry.name));
          results.push({ file: relPath, exports });
        }
      }
    }
  }

  walk(dir);
  return results;
}

// Serialise index to a compact string for Claude's context.
// Truncates to ~8KB: API routes + DB tables take priority.
export function formatIndexForPrompt(index: CodebaseIndex): string {
  const lines: string[] = ['## Codebase Index'];

  lines.push('\n### API Routes');
  for (const r of index.apiRoutes) {
    lines.push(`${r.methods.join(',')} ${r.path}`);
  }

  lines.push('\n### Database Tables');
  for (const t of index.dbTables) {
    lines.push(`${t.name}: ${t.columns.join(', ')}`);
  }

  const base = lines.join('\n');
  if (Buffer.byteLength(base, 'utf8') >= 8000) {
    return base; // already at limit — skip components + lib
  }

  const compLines: string[] = ['\n### Components'];
  for (const c of index.components) {
    compLines.push(`${c.name} (${c.file})`);
  }
  const withComponents = base + '\n' + compLines.join('\n');
  if (Buffer.byteLength(withComponents, 'utf8') >= 8000) {
    return base;
  }

  const libLines: string[] = ['\n### Lib Exports'];
  for (const m of index.libModules) {
    libLines.push(`${m.file}: ${m.exports.join(', ')}`);
  }
  const full = withComponents + '\n' + libLines.join('\n');
  return Buffer.byteLength(full, 'utf8') < 8000 ? full : withComponents;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/builder/codebase-index.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/builder/codebase-index.ts
git commit -m "feat: add codebase index singleton for Builder context"
```

---

## Task 3: Context Bundle + Builder Tools

**Files:**
- Create: `lib/builder/context-bundle.ts`
- Create: `lib/builder/tools.ts`

- [ ] **Step 1: Create context-bundle.ts**

```typescript
// lib/builder/context-bundle.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';

export interface OrgSnapshot {
  orgId: string;
  name: string;
  orgType: string;
  modules: Record<string, boolean>;
  branding: Record<string, string>;
  teamCount: number;
  portfolioCount: number;
  metricCount: number;
}

export async function fetchOrgSnapshot(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgSnapshot | null> {
  const [orgRes, teamRes, portfolioRes, metricsRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, org_type, modules, branding')
      .eq('id', orgId)
      .single(),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('portfolios')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('kpi_definitions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('is_active', true),
  ]);

  if (orgRes.error || !orgRes.data) return null;
  const org = orgRes.data;

  return {
    orgId,
    name: org.name,
    orgType: org.org_type,
    modules: (org.modules as Record<string, boolean>) || {},
    branding: (org.branding as Record<string, string>) || {},
    teamCount: teamRes.count ?? 0,
    portfolioCount: portfolioRes.count ?? 0,
    metricCount: metricsRes.count ?? 0,
  };
}

export function buildSystemPrompt(snapshot: OrgSnapshot, indexAvailable: boolean): string {
  const activeModules = Object.entries(snapshot.modules)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ') || 'none';

  let prompt = `You are the Benevolence Builder — an AI coding agent that helps customize this organization's Benevolence instance.

## Organization Context
Name: ${snapshot.name}
Type: ${snapshot.orgType}
Active modules: ${activeModules}
Team members: ${snapshot.teamCount}
Portfolios: ${snapshot.portfolioCount}
Active KPI definitions: ${snapshot.metricCount}
Current branding: ${JSON.stringify(snapshot.branding)}

## Your Capabilities

You have two categories of tools:

### Config tools (immediate effect)
Use these for changes that can be made at the data layer without modifying source code:
- \`update_org_branding\` — change logo URL or brand color stored in the organizations table
- \`create_metric_definition\` — add a new KPI definition for this org
- \`update_module_config\` — enable or disable feature modules

### Code proposal tool
Use \`submit_code_proposal\` for anything that requires new or changed source files — new components, API routes, DB migrations, modules, or visualizations. The proposal is stored for developer review; the user will see a "submitted for review" card and be notified when it's applied.

## Guidelines
- Always use a config tool when the request can be satisfied at the data layer. Only escalate to a code proposal when source files must change.
- When proposing code, include complete file contents (not partial snippets) and a unified diff.
- Be specific about which files are affected and why.
- If a request is ambiguous, ask a clarifying question before using any tool.
`;

  if (indexAvailable) {
    try {
      const index = getCodebaseIndex();
      prompt += '\n' + formatIndexForPrompt(index);
    } catch {
      prompt += '\n(Codebase index unavailable — proceed without file-level context.)';
    }
  } else {
    prompt += '\n(Codebase index unavailable — proceed without file-level context.)';
  }

  return prompt;
}
```

- [ ] **Step 2: Create tools.ts**

```typescript
// lib/builder/tools.ts
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

// ─── Tool definitions (Anthropic format) ───────────────────────────────────

export const BUILDER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_org_branding',
    description: 'Update the organization branding: logo URL and/or primary brand color.',
    input_schema: {
      type: 'object' as const,
      properties: {
        logo_url: { type: 'string', description: 'Full URL to the org logo image' },
        primary_color: { type: 'string', description: 'Hex color code e.g. #1a2e4a' },
      },
    },
  },
  {
    name: 'update_module_config',
    description: 'Enable or disable a feature module for this organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        module: {
          type: 'string',
          enum: ['tax', 'donors', 'compliance', 'quickbooks'],
          description: 'Module key to toggle',
        },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['module', 'enabled'],
    },
  },
  {
    name: 'create_metric_definition',
    description: 'Create a new KPI/metric definition for this organization.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Human-readable metric name e.g. "Jobs Created"' },
        slug: { type: 'string', description: 'Machine-readable key e.g. "jobs_created" (snake_case)' },
        unit: { type: 'string', description: 'Unit label e.g. "people", "USD", "tons_co2"' },
        description: { type: 'string', description: 'Optional description of what this metric tracks' },
        aggregation: {
          type: 'string',
          enum: ['sum', 'avg', 'last', 'first'],
          description: 'How to aggregate multiple readings',
        },
        direction: {
          type: 'string',
          enum: ['higher_is_better', 'lower_is_better', 'neutral'],
          description: 'Whether higher values are desirable',
        },
      },
      required: ['name', 'slug'],
    },
  },
  {
    name: 'submit_code_proposal',
    description: 'Submit a code change proposal for developer review. Use this when source files must be created or modified.',
    input_schema: {
      type: 'object' as const,
      properties: {
        request_summary: {
          type: 'string',
          description: 'Plain-English description of what this proposal does',
        },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to project root' },
              content: { type: 'string', description: 'Complete new file content' },
              diff: { type: 'string', description: 'Unified diff showing what changed' },
            },
            required: ['path', 'content', 'diff'],
          },
          description: 'Files to create or modify',
        },
      },
      required: ['request_summary', 'files'],
    },
  },
];

// ─── Tool executors ──────────────────────────────────────────────────────────

export type ToolResult =
  | { type: 'config_success'; tool: string; message: string }
  | { type: 'proposal_created'; proposalId: string; summary: string; fileCount: number }
  | { type: 'error'; tool: string; message: string };

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  orgId: string,
  userId: string,
  requestText: string,
  supabase: SupabaseClient,
  adminSupabase: SupabaseClient
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'update_org_branding': {
        const patch: Record<string, string> = {};
        if (toolInput.logo_url) patch.logo_url = toolInput.logo_url as string;
        if (toolInput.primary_color) patch.primary_color = toolInput.primary_color as string;

        const { data: org } = await supabase
          .from('organizations')
          .select('branding')
          .eq('id', orgId)
          .single();

        const merged = { ...(org?.branding ?? {}), ...patch };

        const { error } = await supabase
          .from('organizations')
          .update({ branding: merged })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };

        const parts: string[] = [];
        if (patch.logo_url) parts.push('logo updated');
        if (patch.primary_color) parts.push(`primary color set to ${patch.primary_color}`);
        return { type: 'config_success', tool: toolName, message: `Branding updated: ${parts.join(', ')}.` };
      }

      case 'update_module_config': {
        const module = toolInput.module as string;
        const enabled = toolInput.enabled as boolean;

        const { data: org } = await supabase
          .from('organizations')
          .select('modules')
          .eq('id', orgId)
          .single();

        const modules = { ...(org?.modules ?? {}), [module]: enabled };

        const { error } = await supabase
          .from('organizations')
          .update({ modules })
          .eq('id', orgId);

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'config_success',
          tool: toolName,
          message: `Module "${module}" ${enabled ? 'enabled' : 'disabled'}.`,
        };
      }

      case 'create_metric_definition': {
        const { error } = await supabase.from('kpi_definitions').insert({
          org_id: orgId,
          name: toolInput.name as string,
          slug: toolInput.slug as string,
          unit: (toolInput.unit as string) || null,
          description: (toolInput.description as string) || null,
          aggregation: (toolInput.aggregation as string) || 'sum',
          direction: (toolInput.direction as string) || 'higher_is_better',
        });

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'config_success',
          tool: toolName,
          message: `Metric "${toolInput.name}" created successfully.`,
        };
      }

      case 'submit_code_proposal': {
        const files = toolInput.files as Array<{ path: string; content: string; diff: string }>;
        const summary = toolInput.request_summary as string;

        const { data, error } = await adminSupabase.from('builder_proposals').insert({
          org_id: orgId,
          requested_by: userId,
          request_text: requestText,
          proposal_type: 'code',
          status: 'pending',
          generated_code: { files },
        }).select('id').single();

        if (error) return { type: 'error', tool: toolName, message: error.message };
        return {
          type: 'proposal_created',
          proposalId: data.id,
          summary,
          fileCount: files.length,
        };
      }

      default:
        return { type: 'error', tool: toolName, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    return { type: 'error', tool: toolName, message };
  }
}
```

- [ ] **Step 3: Verify both files compile**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/builder/`.

- [ ] **Step 4: Commit**

```bash
git add lib/builder/context-bundle.ts lib/builder/tools.ts
git commit -m "feat: add Builder context bundle and tool definitions"
```

---

## Task 4: Chat API Route

**Files:**
- Create: `app/api/org/[orgId]/builder/chat/route.ts`

This route streams SSE events to the client. Event format: `data: <JSON>\n\n`. Event types: `text`, `tool_start`, `tool_result`, `proposal`, `done`, `error`.

- [ ] **Step 1: Create the route**

```typescript
// app/api/org/[orgId]/builder/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { fetchOrgSnapshot, buildSystemPrompt } from '@/lib/builder/context-bundle';
import { BUILDER_TOOLS, executeTool, ToolResult } from '@/lib/builder/tools';
import { getCodebaseIndex } from '@/lib/builder/codebase-index';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// Message format stored in builder_sessions.messages
interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createServerClient();
  const adminSupabase = createAdminClient();

  // Auth + admin check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userMessage: string = body.message || '';
  if (!userMessage.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  // Fetch org snapshot and existing session
  const [snapshot, sessionRes] = await Promise.all([
    fetchOrgSnapshot(supabase, orgId),
    supabase
      .from('builder_sessions')
      .select('id, messages')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (!snapshot) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const existingMessages: StoredMessage[] = (sessionRes.data?.messages as StoredMessage[]) || [];

  // Build Claude message history (last 20)
  const history: Anthropic.MessageParam[] = existingMessages
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));

  history.push({ role: 'user', content: userMessage });

  // Build system prompt
  let indexAvailable = true;
  try {
    getCodebaseIndex();
  } catch {
    indexAvailable = false;
  }
  const systemPrompt = buildSystemPrompt(snapshot, indexAvailable);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Streaming response
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(new TextEncoder().encode(sseEvent(data)));
      }

      try {
        let fullAssistantText = '';
        let currentMessages = [...history];

        // Tool use loop — Claude may call tools, we respond, it continues
        while (true) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: BUILDER_TOOLS,
            messages: currentMessages,
            stream: true,
          });

          let stopReason: string | null = null;
          const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
          let currentToolInput = '';
          let currentToolId = '';
          let currentToolName = '';
          let currentTextBlock = '';

          for await (const event of response) {
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = '';
                send({ type: 'tool_start', tool: currentToolName });
              } else if (event.content_block.type === 'text') {
                currentTextBlock = '';
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                currentTextBlock += event.delta.text;
                fullAssistantText += event.delta.text;
                send({ type: 'text', text: event.delta.text });
              } else if (event.delta.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json;
              }
            } else if (event.type === 'content_block_stop') {
              if (currentToolName) {
                let parsedInput: Record<string, unknown> = {};
                try { parsedInput = JSON.parse(currentToolInput); } catch { /* ignore */ }
                toolUseBlocks.push({
                  type: 'tool_use',
                  id: currentToolId,
                  name: currentToolName,
                  input: parsedInput,
                });
                currentToolName = '';
              }
            } else if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? null;
            }
          }

          if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
            break; // No more tool calls — we're done
          }

          // Execute tools and collect results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolBlock of toolUseBlocks) {
            const result: ToolResult = await executeTool(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
              orgId,
              user.id,
              userMessage,
              supabase,
              adminSupabase
            );

            // Send result event to client
            if (result.type === 'proposal_created') {
              send({
                type: 'proposal',
                proposalId: result.proposalId,
                summary: result.summary,
                fileCount: result.fileCount,
              });
            } else {
              send({ type: 'tool_result', result });
            }

            // Feed result back to Claude
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          }

          // Add assistant message + tool results to history for next iteration
          currentMessages = [
            ...currentMessages,
            {
              role: 'assistant' as const,
              content: toolUseBlocks.map(t => ({
                type: 'tool_use' as const,
                id: t.id,
                name: t.name,
                input: t.input,
              })),
            },
            { role: 'user' as const, content: toolResults },
          ];
        }

        // Persist updated session
        const newMessage: StoredMessage = {
          role: 'user',
          content: userMessage,
          timestamp: new Date().toISOString(),
        };
        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: fullAssistantText,
          timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...existingMessages, newMessage, assistantMessage];

        await adminSupabase.from('builder_sessions').upsert({
          org_id: orgId,
          user_id: user.id,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,user_id' });

        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(new TextEncoder().encode(sseEvent({ type: 'error', message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `app/api/org/[orgId]/builder/`.

- [ ] **Step 3: Smoke test with curl**

First get a valid session cookie by logging in to the app, then:

```bash
curl -X POST http://localhost:3000/api/org/YOUR_ORG_ID/builder/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d '{"message":"Hello, what can you help me with?"}' \
  --no-buffer
```

Expected: SSE stream with `data: {"type":"text",...}` lines followed by `data: {"type":"done"}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/org/[orgId]/builder/chat/route.ts
git commit -m "feat: add Builder chat streaming API route with tool loop"
```

---

## Task 5: Proposals API Routes

**Files:**
- Create: `app/api/org/[orgId]/builder/proposals/route.ts`
- Create: `app/api/admin/builder/proposals/[proposalId]/route.ts`

- [ ] **Step 1: Create org proposals GET route**

```typescript
// app/api/org/[orgId]/builder/proposals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await supabase
      .from('builder_proposals')
      .select('id, request_text, proposal_type, status, generated_code, config_patch, reviewer_notes, created_at, reviewed_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create admin PATCH route**

```typescript
// app/api/admin/builder/proposals/[proposalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { proposalId } = await params;
    const supabase = await createServerClient();

    // Must be authenticated super-admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Super-admin check: must have a profile with is_super_admin = true
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { status, reviewer_notes } = body as { status?: string; reviewer_notes?: string };

    const validStatuses = ['approved', 'rejected', 'applied'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .update({
        status,
        reviewer_notes: reviewer_notes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId)
      .select('id, status, org_id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });

    return NextResponse.json({ proposal: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/org/[orgId]/builder/proposals/route.ts \
        app/api/admin/builder/proposals/[proposalId]/route.ts
git commit -m "feat: add Builder proposals API routes (org GET, admin PATCH)"
```

---

## Task 6: SystemGraph Component

**Files:**
- Create: `components/settings/SystemGraph.tsx`

A read-only SVG radial graph. No new dependencies. Org node in center; module, team, portfolio, and integration nodes arranged around it. Green fill if active, grey if not.

- [ ] **Step 1: Create the component**

```tsx
// components/settings/SystemGraph.tsx
'use client';

interface SystemGraphProps {
  modules: Record<string, boolean>;
  teamCount: number;
  portfolioCount: number;
  orgName: string;
}

interface GraphNode {
  id: string;
  label: string;
  sublabel?: string;
  active: boolean;
  angle: number; // degrees from top
}

const MODULE_LABELS: Record<string, string> = {
  tax: 'Tax Center',
  donors: 'Donor CRM',
  compliance: 'Compliance',
  quickbooks: 'QuickBooks',
};

function polarToXY(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

export default function SystemGraph({
  modules,
  teamCount,
  portfolioCount,
  orgName,
}: SystemGraphProps) {
  const cx = 200;
  const cy = 200;
  const radius = 130;

  const moduleKeys = ['tax', 'donors', 'compliance', 'quickbooks'];
  const moduleNodes: GraphNode[] = moduleKeys.map((key, i) => ({
    id: key,
    label: MODULE_LABELS[key],
    active: !!modules[key],
    angle: (i / moduleKeys.length) * 360,
  }));

  const outerNodes: GraphNode[] = [
    {
      id: 'team',
      label: 'Team',
      sublabel: `${teamCount} member${teamCount !== 1 ? 's' : ''}`,
      active: teamCount > 0,
      angle: 270,
    },
    {
      id: 'portfolios',
      label: 'Portfolios',
      sublabel: `${portfolioCount} active`,
      active: portfolioCount > 0,
      angle: 315,
    },
  ];

  const allNodes = [...moduleNodes, ...outerNodes];

  return (
    <div className="relative w-full" style={{ aspectRatio: '1 / 1', maxWidth: 400 }}>
      <svg viewBox="0 0 400 400" className="w-full h-full">
        {/* Edges from center to each node */}
        {allNodes.map(node => {
          const pos = polarToXY(cx, cy, radius, node.angle);
          return (
            <line
              key={`edge-${node.id}`}
              x1={cx}
              y1={cy}
              x2={pos.x}
              y2={pos.y}
              stroke={node.active ? '#1a56db' : '#d1d5db'}
              strokeWidth={1.5}
              strokeDasharray={node.active ? undefined : '4 3'}
            />
          );
        })}

        {/* Outer nodes */}
        {allNodes.map(node => {
          const pos = polarToXY(cx, cy, radius, node.angle);
          const fill = node.active ? '#dbeafe' : '#f3f4f6';
          const stroke = node.active ? '#1a56db' : '#9ca3af';
          const textColor = node.active ? '#1e40af' : '#6b7280';

          return (
            <g key={node.id}>
              <circle cx={pos.x} cy={pos.y} r={30} fill={fill} stroke={stroke} strokeWidth={1.5} />
              <text
                x={pos.x}
                y={node.sublabel ? pos.y - 5 : pos.y + 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight="600"
                fill={textColor}
              >
                {node.label}
              </text>
              {node.sublabel && (
                <text
                  x={pos.x}
                  y={pos.y + 8}
                  textAnchor="middle"
                  fontSize={8}
                  fill={textColor}
                >
                  {node.sublabel}
                </text>
              )}
            </g>
          );
        })}

        {/* Center org node */}
        <circle cx={cx} cy={cy} r={40} fill="#1e3a5f" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fontWeight="700" fill="white">
          {orgName.length > 14 ? orgName.slice(0, 13) + '…' : orgName}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="#93c5fd">
          Organization
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 justify-center mt-2 text-xs text-black/50">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-500 inline-block" />
          Active
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-100 border border-gray-400 inline-block" />
          Inactive
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/settings/SystemGraph.tsx
git commit -m "feat: add SystemGraph SVG component for Builder tab"
```

---

## Task 7: BuilderChat Component

**Files:**
- Create: `components/settings/BuilderChat.tsx`

Streaming chat UI. Reads SSE from the chat route. Renders text messages, config success cards, and proposal cards. Persists nothing locally — history comes from `builder_sessions` via the page.

- [ ] **Step 1: Create the component**

```tsx
// components/settings/BuilderChat.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { CheckCircle, Clock, FileCode, AlertCircle, Send } from 'lucide-react';

interface TextMessage {
  type: 'text';
  role: 'user' | 'assistant';
  content: string;
}

interface ConfigResultMessage {
  type: 'config_result';
  tool: string;
  message: string;
  success: boolean;
}

interface ProposalMessage {
  type: 'proposal';
  proposalId: string;
  summary: string;
  fileCount: number;
}

type ChatMessage = TextMessage | ConfigResultMessage | ProposalMessage;

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BuilderChatProps {
  orgId: string;
  initialMessages: StoredMessage[];
}

export default function BuilderChat({ orgId, initialMessages }: BuilderChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map(m => ({
      type: 'text' as const,
      role: m.role,
      content: m.content,
    }))
  );
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  async function handleSend() {
    const message = input.trim();
    if (!message || streaming) return;

    setInput('');
    setError(null);
    setStreaming(true);
    setStreamingText('');
    setActiveTools([]);

    setMessages(prev => [...prev, { type: 'text', role: 'user', content: message }]);

    const pendingToolResults: ChatMessage[] = [];

    try {
      const res = await fetch(`/api/org/${orgId}/builder/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'text') {
            accText += event.text as string;
            setStreamingText(accText);
          } else if (event.type === 'tool_start') {
            setActiveTools(prev => [...prev, event.tool as string]);
          } else if (event.type === 'tool_result') {
            const result = event.result as { type: string; tool: string; message: string };
            pendingToolResults.push({
              type: 'config_result',
              tool: result.tool,
              message: result.message,
              success: result.type === 'config_success',
            });
            setActiveTools(prev => prev.filter(t => t !== result.tool));
          } else if (event.type === 'proposal') {
            pendingToolResults.push({
              type: 'proposal',
              proposalId: event.proposalId as string,
              summary: event.summary as string,
              fileCount: event.fileCount as number,
            });
          } else if (event.type === 'done') {
            if (accText) {
              setMessages(prev => [
                ...prev,
                ...pendingToolResults,
                { type: 'text', role: 'assistant', content: accText },
              ]);
            } else {
              setMessages(prev => [...prev, ...pendingToolResults]);
            }
            setStreamingText('');
            setActiveTools([]);
          } else if (event.type === 'error') {
            throw new Error(event.message as string);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      setStreamingText('');
      setActiveTools([]);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-black/40 text-sm mt-8">
            <p className="font-medium mb-1">Welcome to Builder</p>
            <p>Ask me to customize your instance — add a metric, adjust branding, or build a new feature.</p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === 'text') {
            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-azure text-white'
                      : 'bg-white border border-black/10 text-black/80'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          }

          if (msg.type === 'config_result') {
            return (
              <div key={i} className="flex justify-start">
                <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm max-w-[85%] border ${
                  msg.success
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {msg.success
                    ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  }
                  <span>{msg.message}</span>
                </div>
              </div>
            );
          }

          if (msg.type === 'proposal') {
            return (
              <div key={i} className="flex justify-start">
                <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm max-w-[85%] border border-blue-200 bg-blue-50 text-blue-900">
                  <FileCode className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{msg.summary}</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {msg.fileCount} file{msg.fileCount !== 1 ? 's' : ''} · In review
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-2 py-0.5">
                      <Clock className="w-3 h-3" /> Pending review
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Active tool indicators */}
        {activeTools.map(tool => (
          <div key={tool} className="flex justify-start">
            <div className="text-xs text-black/40 italic px-2">
              Running {tool.replace(/_/g, ' ')}…
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap bg-white border border-black/10 text-black/80">
              {streamingText}
              <span className="inline-block w-1.5 h-3 bg-black/30 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-black/10 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Builder to customize your instance…"
            disabled={streaming}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-black/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="self-end px-3 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-black/30 mt-1.5 ml-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/settings/BuilderChat.tsx
git commit -m "feat: add BuilderChat streaming SSE chat component"
```

---

## Task 8: BuilderTab, Settings Page, and Nav Update

**Files:**
- Create: `components/settings/BuilderTab.tsx`
- Create: `app/settings/builder/page.tsx`
- Modify: `components/settings/SettingsTabs.tsx`

- [ ] **Step 1: Create BuilderTab.tsx**

```tsx
// components/settings/BuilderTab.tsx
import SystemGraph from './SystemGraph';
import BuilderChat from './BuilderChat';
import { OrgSnapshot } from '@/lib/builder/context-bundle';

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BuilderTabProps {
  snapshot: OrgSnapshot;
  initialMessages: StoredMessage[];
}

export default function BuilderTab({ snapshot, initialMessages }: BuilderTabProps) {
  return (
    <div className="flex gap-6 h-[calc(100vh-280px)] min-h-[500px]">
      {/* Left: System visualization */}
      <div className="w-[40%] flex flex-col items-center justify-start pt-4 bg-white border border-black/10 rounded-xl p-4 overflow-y-auto">
        <h2 className="text-sm font-semibold text-black/50 uppercase tracking-wide mb-4">
          System Overview
        </h2>
        <SystemGraph
          modules={snapshot.modules}
          teamCount={snapshot.teamCount}
          portfolioCount={snapshot.portfolioCount}
          orgName={snapshot.name}
        />
        <div className="mt-6 w-full space-y-2 text-xs text-black/60">
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Org type</span>
            <span className="font-medium capitalize">{snapshot.orgType.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Team members</span>
            <span className="font-medium">{snapshot.teamCount}</span>
          </div>
          <div className="flex justify-between border-b border-black/5 pb-1">
            <span>Portfolios</span>
            <span className="font-medium">{snapshot.portfolioCount}</span>
          </div>
          <div className="flex justify-between pb-1">
            <span>Active KPIs</span>
            <span className="font-medium">{snapshot.metricCount}</span>
          </div>
        </div>
      </div>

      {/* Right: Builder chat */}
      <div className="flex-1 flex flex-col bg-white border border-black/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 flex items-center gap-2">
          <span className="text-sm font-semibold">Builder</span>
          <span className="text-xs text-black/40">AI-powered instance customization</span>
        </div>
        <BuilderChat orgId={snapshot.orgId} initialMessages={initialMessages} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the settings page**

```typescript
// app/settings/builder/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { fetchOrgSnapshot } from '@/lib/builder/context-bundle';
import BuilderTab from '@/components/settings/BuilderTab';

export default async function BuilderPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [snapshot, sessionRes] = await Promise.all([
    fetchOrgSnapshot(supabase, orgId),
    supabase
      .from('builder_sessions')
      .select('messages')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (!snapshot) redirect('/dashboard');

  const initialMessages = (sessionRes.data?.messages as Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>) || [];

  return <BuilderTab snapshot={snapshot} initialMessages={initialMessages} />;
}
```

- [ ] **Step 3: Add Builder tab to SettingsTabs.tsx**

Replace the TABS array:

```typescript
const TABS = [
  { href: '/settings/team',          label: 'Team' },
  { href: '/settings/modules',       label: 'Modules' },
  { href: '/settings/organization',  label: 'Organization' },
  { href: '/settings/integrations',  label: 'Integrations' },
  { href: '/settings/audit',         label: 'Audit Log' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/builder',       label: 'Builder' },
];
```

- [ ] **Step 4: Build and check**

```bash
npm run build
```

Expected: build succeeds, no TypeScript errors. Check that `/settings/builder` renders in the browser with the two-pane layout and all 7 settings tabs visible.

- [ ] **Step 5: Commit**

```bash
git add components/settings/BuilderTab.tsx \
        app/settings/builder/page.tsx \
        components/settings/SettingsTabs.tsx
git commit -m "feat: add BuilderTab split-pane page and Builder nav tab"
```

---

## Task 9: Admin Builder Review Page

**Files:**
- Create: `app/admin/builder/page.tsx`

Server component. Fetches all proposals across all orgs. Client-side approve/reject actions via the admin PATCH route.

- [ ] **Step 1: Create the page**

```tsx
// app/admin/builder/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, CheckSquare, FileCode, ChevronDown, ChevronUp } from 'lucide-react';

interface Proposal {
  id: string;
  org_id: string;
  request_text: string;
  proposal_type: 'config' | 'code';
  status: 'pending' | 'approved' | 'rejected' | 'applied';
  generated_code: { files: Array<{ path: string; content: string; diff: string }> } | null;
  config_patch: Record<string, unknown> | null;
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  org_name?: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  applied: 'bg-green-100 text-green-700 border-green-200',
};

function ProposalCard({ proposal, onUpdate }: { proposal: Proposal; onUpdate: (id: string, status: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function act(status: string) {
    setLoading(true);
    const res = await fetch(`/api/admin/builder/proposals/${proposal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reviewer_notes: notes || undefined }),
    });
    setLoading(false);
    if (res.ok) onUpdate(proposal.id, status);
  }

  return (
    <div className="border border-black/10 rounded-xl bg-white overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs border rounded px-2 py-0.5 font-medium ${STATUS_BADGE[proposal.status]}`}>
                {proposal.status}
              </span>
              <span className="text-xs text-black/40">
                {new Date(proposal.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm font-medium">{proposal.request_text}</p>
            {proposal.generated_code && (
              <p className="text-xs text-black/50 mt-1">
                {proposal.generated_code.files.length} file{proposal.generated_code.files.length !== 1 ? 's' : ''}:{' '}
                {proposal.generated_code.files.map(f => f.path).join(', ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-black/40 hover:text-black/70 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {proposal.status === 'pending' && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional reviewer notes…"
              className="flex-1 text-xs border border-black/15 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/40"
            />
            <button
              onClick={() => act('approved')}
              disabled={loading}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white rounded px-2.5 py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => act('rejected')}
              disabled={loading}
              className="flex items-center gap-1 text-xs bg-red-600 text-white rounded px-2.5 py-1.5 hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}

        {proposal.status === 'approved' && (
          <button
            onClick={() => act('applied')}
            disabled={loading}
            className="mt-3 flex items-center gap-1 text-xs bg-green-600 text-white rounded px-2.5 py-1.5 hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" /> Mark as applied
          </button>
        )}
      </div>

      {expanded && proposal.generated_code && (
        <div className="border-t border-black/10 bg-gray-50 p-4 space-y-4">
          {proposal.generated_code.files.map(file => (
            <div key={file.path}>
              <div className="flex items-center gap-2 mb-2">
                <FileCode className="w-3.5 h-3.5 text-black/40" />
                <span className="text-xs font-mono text-black/70">{file.path}</span>
              </div>
              <pre className="text-xs font-mono bg-white border border-black/10 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-64">
                {file.diff || file.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminBuilderPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');

  useEffect(() => {
    fetch('/api/admin/builder/proposals?' + new URLSearchParams({ status: filter }))
      .then(r => r.json())
      .then(d => { setProposals(d.proposals || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  function handleUpdate(id: string, status: string) {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, status: status as Proposal['status'] } : p));
  }

  return (
    <div className="min-h-screen bg-creme">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-serif text-3xl mb-6">Builder Proposals</h1>

        <div className="flex gap-2 mb-6">
          {['pending', 'approved', 'applied', 'rejected'].map(s => (
            <button
              key={s}
              onClick={() => { setFilter(s); setLoading(true); }}
              className={`text-sm px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === s
                  ? 'bg-azure text-white'
                  : 'bg-white border border-black/10 text-black/60 hover:text-black/80'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-black/40 py-12">Loading proposals…</div>
        ) : proposals.length === 0 ? (
          <div className="text-center text-black/40 py-12">No {filter} proposals.</div>
        ) : (
          <div className="space-y-4">
            {proposals.map(p => (
              <ProposalCard key={p.id} proposal={p} onUpdate={handleUpdate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add admin proposals list route**

The admin page fetches `/api/admin/builder/proposals?status=pending`. Add a GET handler to that route file:

Open `app/api/admin/builder/proposals/[proposalId]/route.ts` — it only handles PATCH on a specific proposal. Add a new route for listing:

Create `app/api/admin/builder/proposals/route.ts`:

```typescript
// app/api/admin/builder/proposals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'applied'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, org_id, request_text, proposal_type, status, generated_code, config_patch, reviewer_notes, created_at, reviewed_at')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ proposals: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds. Visit `/admin/builder` in the browser — page loads, filter buttons work, empty state shows "No pending proposals."

- [ ] **Step 4: Commit**

```bash
git add app/admin/builder/page.tsx \
        app/api/admin/builder/proposals/route.ts
git commit -m "feat: add admin Builder review page and proposals list API"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] `builder_proposals` and `builder_sessions` exist in Supabase with RLS enabled
- [ ] `/settings/builder` is accessible to org admin, redirects non-admin to `/dashboard`
- [ ] Sending a config request in Builder chat applies the change immediately (visible in `/settings/organization` or `/settings/modules`)
- [ ] Sending a code request creates a row in `builder_proposals` with `status=pending`
- [ ] `/admin/builder` shows the pending proposal; Approve → status becomes `approved`; Mark as applied → `applied`
- [ ] Session history persists — revisiting `/settings/builder` shows previous messages
- [ ] All 7 settings tabs are visible and navigation works correctly
- [ ] `npm run build` passes with no TypeScript errors
