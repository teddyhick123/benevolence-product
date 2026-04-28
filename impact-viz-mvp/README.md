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
- **Role-based access control** — Portfolio members, editors, and admins with per-tenant configuration

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Database | Supabase (PostgreSQL, Auth, Row Level Security, Storage) |
| Visualizations | D3.js |
| AI | Anthropic Claude API |
| Integrations | QuickBooks Online OAuth 2.0 |
| PDF generation | jsPDF, jspdf-autotable |

---

## Documentation

- [Getting Started](docs/GETTING_STARTED.md) — Setup and deployment guide for developers
- [User Guide](docs/USER_GUIDE.md) — Day-to-day usage guide for foundation staff
- [Data Migration Guide](docs/MIGRATION_GUIDE.md) — Importing from Blackbaud RE NXT
- [AI Importer Blueprint](docs/AI_IMPORTER_BLUEPRINT.md) — Technical architecture of the import pipeline
- [Demo Environments](docs/DEMO_ENVIRONMENTS.md) — How to set up and run client demos

---

## License

Private — all rights reserved. Built by [Benevolence](https://benevolence.app).
