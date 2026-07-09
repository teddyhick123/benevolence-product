# Phase 6 Integration and Polish Design

## Goal

Phase 6 turns the prior configurability layers into one coherent control surface. Admins should be able to ask Builder how the org is configured, review recent configuration changes, and configure report templates without discovering separate product seams.

## Runtime Surfaces

### Builder Configuration Summary

Builder exposes `summarize_org_configuration`, which reads and formats:

- `organizations` for modules, branding, org type, and legacy AI instructions
- `org_workflow_config` for stage labels, checklists, required fields, and approval requirements
- `org_custom_field_definitions` for typed org fields
- `org_automation_rules` for trigger/action rules
- `org_ai_context` for structured AI behavior
- `org_view_config` for dashboard, table, module default, and vocabulary preferences
- `report_templates` joined through org portfolios
- `builder_events` for recent history

The output is intentionally human-readable rather than raw JSON so the Builder can answer: "Show me everything configured for our org."

### Builder History

Builder exposes `list_builder_history`, backed by `builder_events`. Events remain service-role-written only, preserving the anti-spoofing boundary established in migration `0044_builder_events.sql`.

### Board Report Templates

Builder exposes:

- `save_board_report_template`
- `list_board_report_templates`

Templates use the existing `report_templates` table and store board-report-specific structure in `config`:

```json
{
  "report_type": "board_report",
  "logo_url": null,
  "sections": ["overview", "financials", "holdings", "impact"],
  "content_order": ["overview", "financials", "holdings", "impact"],
  "include_custom_fields": true,
  "custom_field_keys": ["strategic_alignment_score"]
}
```

`report_templates` remains portfolio-scoped because report generation is portfolio-scoped. Builder resolves the org portfolio automatically only when the org has exactly one active portfolio; otherwise it requires `portfolio_id`.

### Assistant Report Templates

The main portfolio assistant's `save_report_template` and `list_report_templates` tools now write to and read from the canonical `report_templates` table. They no longer return `feature_not_available`.

## Onboarding Alignment

Previous phases already provision workflow, custom field, automation, AI context, and view records from onboarding. Phase 6's Builder summary is the post-provisioning handoff: after onboarding, an admin can ask Builder what was configured and receive the full state.

## Acceptance Tests

1. Builder can summarize all six configuration layers and recent history.
2. Builder can list recent configuration history from `builder_events`.
3. Builder can create a board report template using existing report template storage.
4. The portfolio assistant can save and list report templates using `report_templates`.
