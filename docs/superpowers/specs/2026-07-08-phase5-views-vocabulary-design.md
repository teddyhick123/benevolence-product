# Phase 5: Configurable Views and Vocabulary — Design Spec

> Roadmap reference: `docs/CONFIGURABILITY_ROADMAP.md` Phase 5
> Builds on: Phase 2 custom fields and Phase 4 org context

## Goal

Org admins can configure the default dashboard, module landing views, table columns, and top-level entity labels without a code deployment.

## Scope

In:
- `org_view_config` table with org-scoped RLS
- Config scopes: `dashboard`, `module_default`, `table_columns`, `entity_vocabulary`
- Builder tools for dashboard layout, module default view, table columns, vocabulary, and listing current view config
- Dashboard section ordering/hiding from `dashboard.main`
- Grant module default view from `module_default.grant_module`
- Grant table visible columns from `table_columns.grants_table`
- Entity vocabulary hook/API and prompt injection
- Onboarding extraction/provisioning of view preferences

Out:
- Per-user view preferences
- Custom page composition beyond supported sections
- Arbitrary navigation restructuring

## Schema

Migration: `db/migrations/0053_org_view_config.sql`

`org_view_config` stores:
- `org_id`
- `config_scope`
- `scope_key`
- `config_value`
- timestamps

`UNIQUE (org_id, config_scope, scope_key)` gives each org one canonical config row per surface.

## Supported Configs

Dashboard:

```json
{
  "sections": ["tasks", "summary", "kpis", "payout", "holdings_widgets", "grants", "map"],
  "hidden_sections": []
}
```

Grant module default:

```json
{ "default_view": "attention" }
```

Grant table columns:

```json
{ "columns": ["name", "stage", "amount", "custom_fields", "period_end", "owner"] }
```

Entity vocabulary:

```json
{ "singular": "Award", "plural": "Awards" }
```

## Builder Tools

- `set_dashboard_layout`
- `set_module_default_view`
- `set_table_columns`
- `rename_entity`
- `list_view_config`

## Runtime Integration

- `/api/org/[orgId]/view-config` exposes read-only org view config and vocabulary to authenticated org members.
- `app/dashboard/page.tsx` renders dashboard sections in configured order and omits hidden sections.
- `app/dashboard/grants/page.tsx` reads the grant module default view when there is no explicit `?view=...`.
- `components/grants/GrantTableView.tsx` filters visible base/custom columns from `table_columns.grants_table`.
- `useEntityVocabulary()` resolves UI labels from `entity_vocabulary`.
- The main assistant prompt includes an `ENTITY VOCABULARY` section and instructs the model to use display labels in prose while keeping tool arguments canonical.

## Acceptance Criteria

1. Builder can hide the dashboard map and put payout before KPIs; the dashboard persists that order.
2. Builder can set the grant module default to Attention; `/dashboard/grants` lands there unless a URL view is supplied.
3. Builder can configure the grants table to show a custom field column and hide risk/portfolio.
4. Builder can rename grants to awards; grants UI and AI prose use Award/Awards while database/tool names remain canonical.
