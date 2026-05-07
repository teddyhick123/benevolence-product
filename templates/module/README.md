# Module Development Templates

This directory contains templates for creating new platform modules.
Each file demonstrates the patterns and conventions used throughout the codebase.

## Quick Start

To create a new module called `{module_name}`:

### 1. Database Migration
Copy `db/migration.sql` to `/db/00XX_{module_name}.sql` and update:
- Replace `{module_name}` with your module ID (e.g., `campaign_tracking`)
- Replace `{ModuleName}` with display name (e.g., `Campaign Tracking`)
- Define your tables following existing patterns
- Add RLS policies for all tables

### 2. Register the Module
Add to `/lib/modules/types.ts`:
```typescript
export type ModuleId =
  | ...
  | '{module_name}';  // Add here
```

Add to `/lib/modules/client-info.ts` and `/lib/modules/registry.ts`:
- MODULE_INFO entry in client-info.ts
- Full MODULE_REGISTRY entry in registry.ts

### 3. Create AI Tools
Copy `lib/tools.ts` to `/lib/ai/tools/{module_name}.ts` and implement:
- Tool definitions (Anthropic format)
- Tool executor functions
- Input validation using `/lib/ai/validators.ts`

### 4. Create API Routes
Copy `api/route.ts` for each endpoint you need:
- `/app/api/{module_name}/route.ts` - Main resource
- `/app/api/{module_name}/[id]/route.ts` - Individual item

### 5. Create Components
Copy `components/Example.tsx` as a starting point:
- Use existing design patterns
- Wrap with ModuleGate if conditional rendering needed
- Use shared components from `/components/ui/`

### 6. Create Pages
Copy `app/page.tsx` as a starting point:
- Add to routes in MODULE_INFO
- Server-side auth check
- Client component for interactivity

## Template Placeholders

Replace these placeholders throughout:
- `{module_name}` - Lowercase snake_case (e.g., `campaign_tracking`)
- `{ModuleName}` - Display name (e.g., `Campaign Tracking`)
- `{module_name_pascal}` - PascalCase (e.g., `CampaignTracking`)
- `{description}` - Module description

## File Organization

```
/db/00XX_{module_name}.sql          # Database schema
/lib/ai/tools/{module_name}.ts       # AI tool definitions
/app/api/{module_name}/route.ts      # API endpoints
/components/{module_name}/           # React components
/app/dashboard/{module_name}/        # Dashboard pages
```

## Module Registry Entry

Add this to `/lib/modules/registry.ts`:

```typescript
{module_name}: {
  id: '{module_name}',
  name: '{ModuleName}',
  description: '{description}',
  isCore: false,
  icon: 'icon-name',  // From Heroicons
  tools: [
    // List all tool names
  ],
  tables: [
    // List all table names
  ],
  routes: [
    '/dashboard/{module_name}',
  ],
  dependencies: [],  // Add if depends on other modules
  systemPromptAddition: `
You can help with {ModuleName}. Available actions include:
- Action 1
- Action 2
`,
},
```

## Testing Checklist

- [ ] Database migration runs without errors
- [ ] RLS policies allow appropriate access
- [ ] API routes return correct data
- [ ] Components render properly
- [ ] AI tools execute successfully
- [ ] Module can be enabled/disabled
- [ ] Dependencies are handled correctly
