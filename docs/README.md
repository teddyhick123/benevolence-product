# Documentation Map

This folder mixes current reference material with historical reviews, plans, and archived feature notes. When sources disagree, use this order of authority:

1. `db/migrations/` for database schema, table names, functions, RLS, and storage buckets.
2. `AGENTS.md` for current implementation invariants and AI-agent guidance.
3. Current reference docs in this directory.
4. Historical plans, reviews, and archived notes as background only.

## Current References

| Document | Use For |
|---|---|
| `ARCHITECTURE.md` | Current high-level app, module, AI, and tenancy architecture |
| `MODULES.md` | Current module registry and module lifecycle |
| `DATABASE_ARCHITECTURE.md` | Current database map summarized from active migrations |
| `GETTING_STARTED.md` | Local setup |
| `PROVISIONING.md` | New client setup |
| `MIGRATION_GUIDE.md` | Import and migration workflow for customer data |
| `USER_GUIDE.md` | Product user guide |

## Operational Backlogs And Walkthroughs

| Path | Use For |
|---|---|
| `module-reviews/FULL-BACKLOG.md` | Canonical open product/module backlog |
| `module-reviews/MASTER-SUMMARY.md` | Historical review summary; may lag the backlog |
| `walkthroughs/` | Simulated walkthrough missions and coverage notes |

## Historical Material

| Path | Notes |
|---|---|
| `superpowers/plans/` | Implementation plans. Preserve as history; do not treat snippets as current code canon. |
| `superpowers/specs/` | Design specs. Useful for intent; verify schema/API names against active code. |
| `module-reviews/*-review.md` | Module review snapshots. `FULL-BACKLOG.md` is the current rollup. |
| `archive/` | Archived feature notes. Reference only. |
| `architecture/MODULAR_AI_PLATFORM.md` | Historical module architecture proposal. It contains retired schema patterns and is not current canon. |

## Current Schema Reminders

- Active schema lives only in `db/migrations`.
- Module state lives in `organizations.modules` JSONB; there is no `organization_modules` table.
- Org-scoped columns use `org_id`, not `organization_id`.
- Org membership helpers are `can_view_org(p_org_id)` and `user_org_role(p_org_id)`.
- The canonical grant lifecycle table is `grants`; do not recreate `grant_details`.
- Holdings belong to organizations through `holdings.org_id`; there is no `organization_holdings` table.
- Tax Center canonical tables include `tax_years`, `tax_contributions`, `tax_carryforwards`, and `tax_documents`; `owner_tax_profiles` is not active.
