# Impact Platform - Golden Template

A modular, white-label platform for philanthropic organizations. Clone this template to create customized instances for each client.

**Branding**: All branding is configured in `/lib/config/branding.ts` and environment variables. See `.env.example`.

## Database Schema Canon

**`db/migrations` is the single source of truth.** Any SQL outside that directory is stale and must not be treated as authoritative. When in doubt about a table name, column name, or function, read the relevant migration file.

**The database is still prerelease.** No production/customer instances have run these migrations yet, so optimize the active migration set for the best long-term schema rather than preserving migration archaeology. Prefer consolidating duplicate tables, folding patch migrations into the canonical table definition, removing unused legacy schemas, and updating tests/docs to protect the new canon. Do not keep compatibility shims unless product code actively needs them or the user explicitly asks for backwards compatibility.

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

Create `/db/migrations/NNNN_new_module.sql`:

```sql
-- Migration: New Module Name
-- Description: Brief description
-- Date: YYYY-MM-DD

-- 1. CREATE TABLES
CREATE TABLE IF NOT EXISTS public.new_module_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
      p_module: 'new_module'
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

## Key Patterns

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
- [ ] Migration runs without errors
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
- Database patterns: Check similar migrations in `/db/migrations/`
- Component patterns: Check similar components in `/components/`
