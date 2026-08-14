# Documentation Map

This folder contains the current product and engineering references, the active
backlog, coding-agent records, walkthrough missions, and historical material.
When sources disagree, use this order of authority:

1. `db/migrations/` for database schema, table names, functions, RLS, and storage buckets.
2. `AGENTS.md` for implementation invariants and AI-agent guidance; `CLAUDE.md` mirrors the protected schema protocol.
3. [`agent-work/BACKLOG.md`](agent-work/BACKLOG.md) for actionable work.
4. Current engineering and guide documents for explanation.
5. Dated agent records and archive material for historical context only.

## Current Documentation

| Path | Use For |
|---|---|
| [`product/`](product/) | Product vision, roadmap, configurability direction, and market context |
| [`engineering/`](engineering/) | Architecture, database, modules, Builder, importer, and repository hygiene |
| [`guides/`](guides/) | Local setup, provisioning, migration, demonstrations, and user guidance |
| [`agent-work/BACKLOG.md`](agent-work/BACKLOG.md) | Canonical consolidated backlog for product, reliability, security, Builder, and test-infrastructure work |
| [`agent-work/`](agent-work/) | Durable coding-agent plans and design records; start with its README |
| [`walkthroughs/`](walkthroughs/) | Simulated walkthrough missions and coverage notes |

## Historical Material

| Path | Notes |
|---|---|
| [`archive/audits/`](archive/audits/) | Completed audit records; open items belong in the backlog |
| [`archive/architecture/`](archive/architecture/) | Historical architecture proposals; verify names against current code and migrations |
| [`archive/module-reviews/`](archive/module-reviews/) | Historical module-review snapshots |
| [`archive/plans/`](archive/plans/) | Completed sprint plans (April–May 2026) |

## Current Schema Reminders

- Active schema lives only in `db/migrations`.
- Module state lives in `organizations.modules` JSONB; there is no `organization_modules` table.
- Org-scoped columns use `org_id`, not `organization_id`.
- The canonical grant lifecycle table is `grants`; do not recreate `grant_details`.
- Holdings belong to organizations through `holdings.org_id`; there is no `organization_holdings` table.
- Assistant state uses request-idempotent `ai_turns` and append-only `ai_messages`.
