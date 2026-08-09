# Documentation Map

This folder contains current references, active backlogs, walkthrough missions, and archived historical material. When sources disagree, use this order of authority:

1. `db/migrations/` for database schema, table names, functions, RLS, and storage buckets.
2. `AGENTS.md` (project root) for implementation invariants and AI-agent guidance; `CLAUDE.md` mirrors the protected schema protocol.
3. Current reference docs in this directory.
4. Historical plans, reviews, and archived notes as background only.

## Current References

| Document | Use For |
|---|---|
| `PLATFORM_VISION.md` | Product vision, what "tailored to your org" means, and the configurability gap |
| `CONFIGURABILITY_ROADMAP.md` | Six-phase roadmap from current state to the full dream OS — sequencing, scope, acceptance criteria |
| `CONFIGURABILITY_ARCHITECTURE.md` | Technical sketch of current configurability layers, the three missing layers, and the Builder's evolution |
| `ARCHITECTURE.md` | High-level app, module, AI, and tenancy architecture |
| `MODULES.md` | Module registry and module lifecycle |
| `DATABASE_ARCHITECTURE.md` | Database map summarized from active migrations |
| `GETTING_STARTED.md` | Local setup |
| `HYGIENE.md` | Dead-code/dependency checks, analyzer exceptions, and documentation authority |
| `PROVISIONING.md` | New client setup |
| `MIGRATION_GUIDE.md` | Import and migration workflow for customer data |
| `USER_GUIDE.md` | Product user guide for end users |
| `DEMO_ENVIRONMENTS.md` | Demo scenarios for prospect meetings |
| `PHILANTHROPY_TECH_MARKET_MAP.md` | Market context and competitive landscape |

## Operational Backlogs And Walkthroughs

| Path | Use For |
|---|---|
| `module-reviews/FULL-BACKLOG.md` | Canonical open product/module backlog (P1/P2/P3) |
| `module-reviews/2026-06-27-reliability-audit.md` | Current reliability audit — 8 critical issues across financial data, compliance, and RLS |
| `walkthroughs/` | Simulated walkthrough missions and coverage notes |

## Historical Material

| Path | Notes |
|---|---|
| `superpowers/plans/` (June 2026) | Active implementation plans. Older plans moved to `archive/plans/`. |
| `superpowers/specs/` | Design specs. Useful for intent; verify schema/API names against active code. |
| `archive/plans/` | Completed sprint plans (April–May 2026). Preserve as history only. |
| `archive/module-reviews/` | Module review snapshots (April 2026). `FULL-BACKLOG.md` is the current rollup. |
| `archive/` | Archived feature notes. Reference only. |
| `architecture/MODULAR_AI_PLATFORM.md` | Historical module architecture proposal. Contains retired schema patterns; not current canon. |

## Current Schema Reminders

- Active schema lives only in `db/migrations`.
- Module state lives in `organizations.modules` JSONB; there is no `organization_modules` table.
- Org-scoped columns use `org_id`, not `organization_id`.
- Org membership helpers are `can_view_org(p_org_id)` and `user_org_role(p_org_id)`.
- The canonical grant lifecycle table is `grants`; do not recreate `grant_details`.
- Holdings belong to organizations through `holdings.org_id`; there is no `organization_holdings` table.
- Tax Center canonical tables: `tax_years`, `tax_contributions`, `tax_carryforwards`, `tax_documents`; `owner_tax_profiles` is not active.
- Assistant state uses request-idempotent `ai_turns` and append-only `ai_messages`; do not replace it with session history blobs.
- Organization variability belongs in sanctioned data/configuration extension points, not per-client DDL.
