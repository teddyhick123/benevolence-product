# Impact Platform Architecture

## Overview

This is a white-label platform for impact portfolio management. Organizations can rapidly create customized software by enabling modules that provide specific functionality. The platform uses AI-powered features for data entry, analysis, and automation.

**Note**: This is a golden template. Clone for each client and customize branding via `/lib/config/branding.ts`.

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
├── contexts/                 # React contexts
│   └── ModuleContext.tsx    # Module state management
│
├── db/                       # Database migrations (SQL)
│   └── 00XX_*.sql           # Sequential migrations
│
├── lib/                      # Core libraries
│   ├── ai/                  # AI assistant components
│   │   ├── types.ts         # Shared types
│   │   ├── validators.ts    # Input validation
│   │   └── tools/           # Module tool definitions
│   ├── modules/             # Module system
│   │   ├── types.ts         # Module types
│   │   ├── client-info.ts   # Client-safe module data
│   │   ├── registry.ts      # Full module definitions
│   │   └── tool-filter.ts   # Tool filtering logic
│   └── supabase.ts          # Database client
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
2. **Database**: Create migration in `db/`
3. **Tools**: Define in `lib/ai/tools/{module}.ts`
4. **API**: Create routes in `app/api/{module}/`
5. **UI**: Add components and pages
6. **Enable**: Organization enables via settings or onboarding

### Available Modules

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| `core` | Portfolio management | - |
| `impact_tracking` | KPIs and metrics | - |
| `reporting` | Reports and exports | impact_tracking |
| `tax_optimization` | Tax scenarios | - |
| `grant_management` | Grant workflows | - |
| `donor_management` | Donor tracking | - |
| `external_data` | Third-party data | - |
| `analytics` | Projections and insights | impact_tracking |

## AI System Architecture

### PortfolioAssistant

The main AI assistant class provides:

- **Conversation Management**: Message history, streaming
- **Tool Execution**: Execute tools with context
- **Action Tracking**: Record changes for undo/redo
- **Module Integration**: Filter tools by enabled modules

### Tool Pattern

```typescript
// Tool definition (provider-neutral format)
const tool: ToolDefinition = {
  name: 'tool_name',
  description: 'What the tool does',
  input_schema: {
    type: 'object',
    properties: { /* ... */ },
    required: ['field1']
  }
};

// Tool executor
async function executeTool(
  input: InputType,
  context: ToolExecutorContext
): Promise<ToolResult> {
  // Validate input
  InputValidator.validateRequired(input.field1, 'field1');

  // Execute business logic
  const { data, error } = await context.supabase
    .from('table')
    .insert({ /* ... */ });

  // Return with action tracking
  return {
    action: { /* AIAction for undo */ },
    output: { success: true, data }
  };
}
```

### Context Flow

```
User Message
    │
    ▼
┌──────────────────┐
│ Get Org Context  │
│ (modules, role)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Filter Tools     │
│ (by modules)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ AI Provider      │
│ (with tools)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Execute Tools    │
│ (with context)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Track Actions    │
│ (for undo)       │
└────────┬─────────┘
         │
         ▼
Response to User
```

## Database Architecture

### Multi-Tenancy Model

- **Organizations**: Top-level tenant isolation
- **Row Level Security**: All tables protected by RLS
- **Helper Functions**: `is_org_member()`, `is_org_admin()`

### Key Tables

```sql
-- Organization hierarchy
organizations → organization_members → users
            ↓
organization_modules (enabled features)

-- Portfolio data
portfolios → holdings → metric_facts
                     → widgets
                     → grant_details

-- AI system
ai_sessions → ai_actions (undo/redo history)
```

### RLS Pattern

```sql
-- Standard pattern for module tables
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    is_org_member(organization_id) AND
    org_has_module(organization_id, 'module_id')
  );
```

## Authentication Flow

```
1. User visits /login
2. Supabase Auth (email/password or OAuth)
3. Session tokens stored in cookies
4. Server components validate via createServerComponentClient
5. API routes validate via createRouteHandlerClient
6. RLS enforces data access
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
// Standard error response
return NextResponse.json(
  { error: 'Human readable message' },
  { status: 400 }
);
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
- JSONB for flexible metadata storage
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
2. **Route Protection**: Server component checks
3. **RLS**: Database-level enforcement
4. **Module Gating**: Feature availability

## Development Workflow

### Adding a Feature

1. Check if existing module covers it
2. If new module needed, use templates
3. Create migration, tools, API, components
4. Add to registry
5. Test with onboarding flow

### Testing Checklist

- [ ] Database migration applies cleanly
- [ ] RLS policies work correctly
- [ ] API routes return expected data
- [ ] AI tools execute successfully
- [ ] Components render properly
- [ ] Module can be enabled/disabled
