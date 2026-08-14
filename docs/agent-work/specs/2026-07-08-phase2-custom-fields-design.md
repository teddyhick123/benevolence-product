# Phase 2: Custom Fields — Design Spec

> Roadmap reference: `docs/CONFIGURABILITY_ROADMAP.md` Phase 2
> Builds on: Phase 1 runtime workflow configuration

## Goal

Org admins can define typed, org-scoped custom fields for grants, holdings, donors, and contributions. Values are stored in a canonical table, editable through org APIs, visible on grant detail pages and grant tables, readable/queryable by the AI assistant, and enforceable as grant stage requirements.

## Scope

In:
- Custom field definitions for `grant`, `holding`, `donor`, and `contribution`
- Field types: `text`, `integer`, `decimal`, `boolean`, `date`, `enum`
- Typed custom field values with exactly one populated value column
- DB integrity checks for org/entity/definition matching
- Builder tools to create, list, update, and remove definitions
- API routes to list definitions and read/write values
- Detail-page custom field panels for grants, holdings, and donors
- Grant table custom field columns with sort and filter controls
- Grant transition gating for grant fields with `required_at_stage`
- AI tools `get_custom_fields` and `search_custom_field_values`

Out:
- Multi-select fields
- Custom fields on child tables such as grant milestones/payments
- Aggregations/reporting over custom fields
- Automation triggers on custom fields

## Schema

Migration: `db/migrations/0050_custom_fields.sql`

### `org_custom_field_definitions`

One row per org-defined field:

- `org_id`
- `entity_type`: `grant | holding | donor | contribution`
- `field_key`: snake_case unique key per org/entity
- `field_label`
- `field_type`: `text | integer | decimal | boolean | date | enum`
- `enum_options`: required for enum, otherwise null
- `required_at_stage`: grant fields only, canonical lifecycle stage
- `is_ai_readable`
- `sort_order`

### `org_custom_field_values`

One row per entity/value:

- `org_id`
- `entity_id`
- `entity_type`
- `field_definition_id`
- typed value columns: `value_text`, `value_numeric`, `value_boolean`, `value_date`

Integrity is enforced by trigger:

1. Definition belongs to the same org/entity type.
2. Entity exists and belongs to the same org.
3. Exactly one typed value is populated for non-null values.
4. Populated column matches field type.
5. Enum values are present in `enum_options`.

For `entity_type = 'contribution'`, the trigger accepts either `contributions_received` or `tax_contributions` rows scoped to the same `org_id`.

## Builder Tools

- `create_custom_field`
- `list_custom_fields`
- `update_custom_field`
- `remove_custom_field`

All tools require `org_has_module(orgId, 'grant_management')` only when operating on grant fields with `required_at_stage`; otherwise they are configuration tools available to org admins through Builder.

## APIs

### `GET /api/org/[orgId]/custom-fields?entity_type=grant`

Returns definitions for an entity type. Admin/member read after `user_org_role`.

### `POST /api/org/[orgId]/custom-fields`

Creates a definition. Admin only.

### `PATCH /api/org/[orgId]/custom-fields/[fieldId]`

Updates label, enum options, `required_at_stage`, AI readability, and sort order. Admin only.

### `DELETE /api/org/[orgId]/custom-fields/[fieldId]`

Deletes the definition and cascades values. Admin only.

### `GET /api/org/[orgId]/custom-fields/values?entity_type=grant&entity_id=...`

Returns definitions and current values for one entity.

### `PUT /api/org/[orgId]/custom-fields/values`

Upserts/deletes values for one entity. Members can write values for org-scoped entities.

### `GET /api/org/[orgId]/custom-fields/batch?entity_type=grant&entity_ids=...`

Returns definitions and values for up to 200 entities. Used by table/list surfaces so custom fields can be rendered as columns without per-row requests.

## Grant Transition Gate

`transitionGrant()` calls a custom-field gate after the Phase 1 workflow gate. For a grant leaving stage `fromStage`, all grant custom field definitions with `required_at_stage = fromStage` must have a non-null/non-empty value.

Example: a field `strategic_alignment_score` with `required_at_stage = 'due_diligence'` blocks `due_diligence -> recommended` until set.

## UI

Grant, holding, and donor detail pages render `CustomFieldsPanel`. It:

- Fetches definitions and values for the current entity
- Renders controls based on field type
- Saves changed values through the values API
- Shows required-stage metadata for grant fields

The grants table fetches grant custom fields in one batch for the visible grant IDs. Each custom field appears as a sortable column. The table also includes a custom-field filter that supports text contains, enum/boolean equality, and numeric/date comparison operators.

## AI Querying

`get_custom_fields` returns AI-readable custom fields for one entity.

`search_custom_field_values` finds entities by AI-readable field value using typed comparisons:

- text/enum: `eq`, `contains`
- integer/decimal/date: `eq`, `lt`, `lte`, `gt`, `gte`
- boolean: `eq`

Grant searches are scoped to the active portfolio and can be additionally filtered by lifecycle stage.

## Acceptance Criteria

1. Builder creates a grant custom field `strategic_alignment_score` required at `due_diligence`.
2. Grant detail shows the field and allows an org member to set it.
3. Transitioning out of `due_diligence` without a value returns a workflow block.
4. Setting the value allows the transition if other gates pass.
5. Removing the field definition deletes its values via cascade.
6. The grants table shows the field as a sortable/filterable column.
7. The AI can search grants by custom field values, e.g. active grants with alignment score below 3.
