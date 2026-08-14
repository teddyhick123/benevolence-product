# Benevolence

> Custom portfolio management software for philanthropic foundations and family offices.

Benevolence is a purpose-built platform that replaces legacy tools like Blackbaud RE NXT with software your organization fully owns. No annual SaaS fees, no vendor lock-in — just a modern, maintainable system tailored to your workflows.

---

## What It Does

- **Portfolio management** — Track equities, debt, grants, PRIs, and MRIs across a unified dashboard
- **Impact KPI tracking** — Configurable D3 visualizations (heatmaps, timelines, bubble charts, trend lines)
- **Tax center** — Contribution tracking, AGI deduction limits, carryforward schedules, TurboTax/Excel/PDF export
- **AI-powered data import** — Migrate from Blackbaud RE NXT with AI-assisted field mapping, validation, and reconciliation
- **Board report generation** — One-click PDF reports with portfolio summary, holdings breakdown, and KPI snapshot
- **QuickBooks Online integration** — OAuth 2.0 connect, chart of accounts sync, journal entry export
- **AI portfolio assistant** — Ask questions about your portfolio in natural language
- **Charity discovery** — Search nonprofits with ratings from Charity Navigator, GiveWell, and ProPublica
- **Role-based access control** — Organization and portfolio viewers, members, admins, and owners with tenant-scoped repositories and RLS

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Database | Supabase (PostgreSQL, Auth, Row Level Security, Storage) |
| Visualizations | D3.js |
| AI | Provider-neutral assistant with OpenAI and Anthropic adapters |
| Integrations | QuickBooks Online OAuth 2.0 |
| PDF generation | jsPDF, jspdf-autotable |

---

## Documentation

- [Documentation Map](docs/README.md) — Current product, engineering, guide, and historical-reference map
- [Getting Started](docs/guides/GETTING_STARTED.md) — Setup and deployment guide for developers
- [Architecture](docs/engineering/ARCHITECTURE.md) — Access, repository, browser, AI durability, and schema boundaries
- [Module System](docs/engineering/MODULES.md) — Current module extension workflow
- [Repository Hygiene](docs/engineering/HYGIENE.md) — Dead-code/dependency policy and verification commands
- [User Guide](docs/guides/USER_GUIDE.md) — Day-to-day usage guide for foundation staff
- [Data Migration Guide](docs/guides/MIGRATION_GUIDE.md) — Importing from Blackbaud RE NXT
- [AI Importer Blueprint](docs/engineering/AI_IMPORTER_BLUEPRINT.md) — Technical architecture of the import pipeline
- [Demo Environments](docs/guides/DEMO_ENVIRONMENTS.md) — How to set up and run client demos
- [Open Work Backlog](docs/agent-work/BACKLOG.md) — The current queue for product, reliability, security, Builder, and test work
- [Agent Work Records](docs/agent-work/README.md) — How coding agents use plans and specs without overriding the current canon

## Repository Tour

| Location | Responsibility |
|----------|----------------|
| `app/` | Product pages, layouts, and API routes |
| `components/` | UI grouped by product domain |
| `lib/` | Domain logic, data repositories, shared APIs, integrations, and AI; see the [library ownership guide](lib/README.md) |
| `lib/api/repositories/` | Tenant-scoped data behavior, indexed by the [repository map](lib/api/repositories/README.md) |
| `db/migrations/` | The sole canonical database schema history |
| `db/seeds/`, `db/demo/` | Bounded local/demo data only; never schema authority |
| `supabase/` | Local Supabase configuration; generated local state is ignored |
| `docker/` | Trusted build definitions for isolated local verification services |
| `public/` | Static product assets served by Next.js |
| `scripts/` | Repeatable developer, verification, and operational commands |
| `templates/` | Tested module-development template |
| `tests/` | Unit, integration, and walkthrough coverage |

## Common Commands

```bash
npm run dev              # Run the app locally
npm run verify:hygiene   # Find dead files and dependency drift
npm run verify:types     # Type-check the application
npm run verify:unit      # Run unit and contract tests
npm run verify:rate-limits # Verify local rate limits (requires npm run dev)
npm run clean:local      # Remove ignored build, test, and tool outputs
```

The `clean:local` command removes only ignored, regenerable local outputs. It never removes source files, migrations, environment files, or dependencies.

---

## License

Private — all rights reserved. Built by [Benevolence](https://benevolence.app).
