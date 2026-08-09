# Impact Platform Architecture

## Overview

This is a white-label platform for philanthropic portfolio management — foundations, family offices, and DAF sponsors. Each deployment is a cloned instance with its own database, auth, and branding.

Organizations configure their experience by enabling feature modules (grants, tax, donors, compliance, analytics, etc.) and using the AI assistant and Builder to work within those modules. Organization-specific fields, KPIs, layouts, workflows, automations, and module choices live in the sanctioned data/configuration extension points. Builder may propose a schema migration only for a genuine shared platform product increment, never as per-client DDL.

**Note**: This is a golden template. Clone for each client and customize branding via `/lib/config/branding.ts`.

**Schema canon**: `db/migrations` is the source of truth for database tables, functions, RLS, and storage buckets. Historical docs and implementation plans may contain retired table names.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│  Next.js App Router                                                  │
│  ├── Server Components (auth, data fetching)                        │
│  ├── Client Components (interactivity)                              │
│  └── API Routes (REST endpoints)                                    │
├─────────────────────────────────────────────────────────────────────┤
│                          AI LAYER                                    │
├─────────────────────────────────────────────────────────────────────┤
│  PortfolioAssistant                                                 │
│  ├── Tool Definitions (provider-neutral schema)                     │
│  ├── Tool Executors (business logic)                                │
│  ├── Module Filtering (context-aware tools)                         │
│  └── Action Tracking (undo/redo)                                    │
├─────────────────────────────────────────────────────────────────────┤
│                          DATA LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Supabase (PostgreSQL)                                              │
│  ├── Row Level Security (multi-tenant)                              │
│  ├── RPC Functions (complex operations)                             │
│  ├── Realtime Subscriptions (live updates)                          │
│  └── Auth (JWT sessions)                                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Client Data Boundary

Server components should provide initial data when it is naturally available during page composition. Browser refresh and mutation revalidation are owned by domain hooks under `lib/<domain>/hooks.ts`; those hooks share SWR and the canonical JSON/error behavior in `lib/api/client-hooks.ts`.

All browser requests pass through `lib/api/client.ts`:

- `requestJson` is the ordinary JSON request/parser and throws a typed `ApiClientError`.
- `readJson` supports the narrower case where a caller intentionally inspects status or headers before parsing.
- `uploadJson`, `requestDownload`, and `requestStream` preserve multipart, file, and streaming semantics.
- `apiRequest` is the response-preserving low-level primitive and is not a tenant authorization mechanism.

Components and client pages do not call raw `fetch` or define local SWR fetchers. Client org/portfolio IDs remain routing inputs; server guards and tenant-scoped repositories authorize every request. Server-only upstream integrations and Builder's verifier/GitHub transports retain their own bounded HTTP clients.

## Directory Structure

```
/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── ai/              # AI assistant endpoints
│   │   ├── org/[orgId]/     # Organization-scoped endpoints
│   │   └── {module}/        # Module-specific endpoints
│   ├── dashboard/           # Main application pages
│   ├── onboarding/          # User onboarding flow
│   └── org/[orgId]/         # Organization management pages
│
├── components/               # React components
│   ├── ui/                  # Shared UI primitives
│   ├── onboarding/          # Onboarding-specific
│   └── {module}/            # Module-specific components
│
├── db/
│   ├── migrations/          # Sole schema canon (ordered SQL)
│   └── demo/                # Non-canonical local demo data
│
├── lib/                      # Core libraries
│   ├── api/                 # Access guards, repositories, responses, browser transport
│   ├── ai/                  # AI assistant components
│   │   ├── types.ts         # Shared types
│   │   ├── validators.ts    # Input validation
│   │   └── assistant/       # Tool definitions, executors, prompts, context
│   ├── modules/             # Module system
│   │   ├── types.ts         # Module types
│   │   ├── client-info.ts   # Client-safe module data
│   │   ├── registry.ts      # Full module definitions
│   │   └── tool-filter.ts   # Tool filtering logic
│   ├── hooks/               # Generic browser/UI hooks (no data-domain ownership)
│   └── {domain}/hooks.ts    # Domain-owned interactive data hooks
│
├── templates/                # Module development templates
│   └── module/              # Template files
│
└── docs/                     # Documentation
```

## Module System

### Module Definition

Each module is defined in the registry with:

```typescript
{
  id: 'module_id',           // Unique identifier
  name: 'Display Name',       // User-facing name
  description: 'What it does',
  isCore: false,              // Core modules always enabled
  icon: 'heroicon-name',
  tools: ['tool1', 'tool2'],  // AI tools provided
  tables: ['table1'],         // Database tables
  routes: ['/dashboard/x'],   // UI routes
  dependencies: ['other'],    // Required modules
  systemPromptAddition: '...' // AI context
}
```

### Module Lifecycle

1. **Registration**: Add to `MODULE_REGISTRY` in `registry.ts`
2. **Database**: Apply the schema decision protocol: use configuration/custom fields for org variability; create a migration only for a genuine shared platform concept
3. **Repository**: Put elevated behavior in a tenant-scoped repository created only after access is proved
4. **Tools**: Define provider-neutral schemas and small executors; inject elevated behavior through scoped capabilities
5. **API**: Create guarded routes under the owning org/portfolio scope and use shared responses
6. **UI**: Put browser data ownership in domain hooks using the shared transport
7. **Enable**: Organization enables via settings or onboarding

### Available Modules

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| `core` | Portfolio management | - |
| `impact_tracking` | KPIs and metrics | - |
| `reporting` | Reports and exports | impact_tracking |
| `tax_optimization` | Tax scenarios | - |
| `grant_management` | Grant workflows | - |
| `donor_management` | Donor tracking | - |
| `pledge_tracking` | Pledges and installment schedules | donor_management |
| `external_data` | Third-party data | - |
| `analytics` | Projections and insights | impact_tracking |
| `compliance_regulatory` | Compliance, payout, filings, ER tracking | grant_management |

## AI System Architecture

### PortfolioAssistant

The main AI assistant class provides:

- **Conversation Management**: Message history, streaming
- **Tool Execution**: Execute tools with context — the assistant can mutate data (create holdings, transition grants, log contributions, record payments, etc.), not just answer questions
- **Action Tracking**: Record changes for undo/redo; every mutation writes to `ai_actions`
- **Module Integration**: Filter tools by enabled modules — disabled module tools are removed from the context entirely

### Builder

A separate AI layer (`app/api/org/[orgId]/builder/`) gives org admins a configuration interface. It reads the org's current module state and codebase scaffold context, then generates proposals for enabling/disabling modules, creating KPI structures, or scaffolding new data shapes. Proposals are reviewed and applied via a PR-based flow. See `lib/builder/` for implementation.

### Tool and persistence pattern

Tool definitions are provider-neutral. Each registered executor receives an
authenticated runtime and scoped `AssistantToolCapabilities`; an elevated
client is never passed into a tool executor. Mutation tools return an
`ai_actions` record so undo/redo remains durable.

The chat route owns conversation persistence:

1. `begin_ai_turn` claims the `(user_id, request_id)` idempotency boundary.
2. The normalized user message is appended to `ai_messages` once.
3. The provider streams and invokes only module-enabled tools.
4. Tool actions are persisted with the turn.
5. The assistant message is appended and `complete_ai_turn` records the
   terminal response. Failures use `fail_ai_turn`.
6. A retry with the same request ID reuses the durable turn instead of
   duplicating messages or mutations.

Module executors must not create a parallel conversation store, write session
history blobs, or implement check-then-insert retry logic.

### Request flow

```text
browser domain hook
  → shared browser transport
  → scoped API route
  → access guard
  → tenant-scoped repository/capabilities
  → RLS-backed database

AI chat request
  → durable turn claim
  → module-filtered provider tools
  → scoped capabilities + action persistence
  → durable assistant message + terminal turn
```
## Database Architecture

### Multi-Tenancy Model

- **Organizations**: Top-level tenant isolation
- **Row Level Security**: All tables protected by RLS
- **Helper Functions**: `can_view_org(p_org_id)`, `user_org_role(p_org_id)`, `is_org_admin(org_id)`, `is_app_admin()`
- **Module State**: `organizations.modules` JSONB checked with `org_has_module(p_org_id, p_module)`

### Key Tables

```sql
-- Organization hierarchy
organizations → organization_members → users
            ↓
organizations.modules JSONB (enabled modules)

-- Portfolio data
portfolios → holdings → metric_facts
                     → widgets
                     → grants

-- AI system
ai_sessions → ai_turns → ai_messages
                    ↘ ai_actions (undo/redo history)
```

### RLS Pattern

```sql
-- Standard pattern for module tables
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    can_view_org(org_id) AND
    org_has_module(org_id, 'module_slug')
  );
```

## Authentication Flow

```
1. User visits /login
2. Supabase Auth (email/password or OAuth)
3. Session tokens stored in cookies
4. Server code validates the cookie session through `lib/api/server-client.ts`
5. API routes use `requireUserAccess`, `requireOrgAccess`, `requirePortfolioAccess`, or a purpose-built public/job guard
6. Authorized elevated work is constrained inside a tenant-scoped repository
7. RLS remains the database backstop
```

## Onboarding System

The hybrid onboarding combines structured intake with AI conversation:

```
Quick Intake (30s)          AI Conversation (3-5min)     Module Selection
├── Org type                ├── Pain point discovery      ├── Recommendations
├── Org name                ├── Goal extraction           ├── User adjustments
├── Team size               ├── Workflow understanding    └── Confirm
└── Focus areas             └── Team context
```

### Onboarding Tables

- `onboarding_sessions`: Tracks progress and quick intake
- `onboarding_profiles`: Extracted user needs
- `onboarding_recommendations`: AI-generated module suggestions

## Styling Architecture

### Tailwind CSS Configuration

- **Colors**: azure (brand), neutral (gray scale)
- **Spacing**: Standard Tailwind scale
- **Components**: Consistent patterns via utility classes

### Design Patterns

```tsx
// Card pattern
<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">

// Button pattern
<button className="px-4 py-2 bg-azure text-white rounded-lg font-medium
                  hover:bg-azure/90 transition-colors">

// Input pattern
<input className="w-full px-4 py-2 border border-neutral-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-azure/20
                 focus:border-azure">
```

## Error Handling

### API Routes

```typescript
return jsonError('Human readable message', 400);
return jsonOk({ data });
```

### AI Tools

```typescript
// Validation errors
if (error instanceof ValidationError) {
  return { action: null, output: { error: error.message, type: 'validation' } };
}

// Unexpected errors
throw error; // Caught by assistant, returned to user
```

## Performance Considerations

### Database

- Indexes on foreign keys and common query patterns
- Validated JSONB only for sanctioned configuration and metadata
- RPC functions for complex operations

### Frontend

- Server Components for initial data
- Client Components for interactivity
- Streaming responses for AI

### AI

- Tool filtering reduces payload size
- Action batching for undo operations
- Caching for repeated queries

## Security Model

### Input Validation

All AI tool inputs validated using:
- `InputValidator.validateUUID()` - UUID format
- `InputValidator.validateString()` - Length/pattern
- `InputValidator.validateNumber()` - Range
- `InputValidator.validateRequired()` - Presence

### Authorization Layers

1. **Authentication**: Supabase Auth
2. **Route Protection**: Shared access guards establish principal and tenant scope
3. **Repository Scope**: Elevated operations cannot widen the authorized tenant
4. **RLS**: Database-level enforcement
5. **Module Gating**: Feature availability

## Development Workflow

### Adding a Feature

1. Check whether an existing module or sanctioned configuration point covers it
2. Apply the schema decision protocol before proposing DDL
3. If a new module is needed, use the tested module templates
4. Add scoped repository, guarded route, domain hook/UI, and scoped AI capability as needed
5. Register the module and verify hygiene, boundaries, migrations, and onboarding

### Testing Checklist

- [ ] Database migration applies cleanly
- [ ] RLS policies work correctly
- [ ] API routes return expected data
- [ ] AI tools execute successfully
- [ ] Components render properly
- [ ] Module can be enabled/disabled
