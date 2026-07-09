# Self-Service Workbench Roadmap

> **Relationship to existing docs:** `CONFIGURABILITY_ROADMAP.md` defines the runtime configuration spine. `AI_IMPORTER_BLUEPRINT.md` defines the import and migration foundation. This document sits one level above both: it sequences the product work needed to turn the platform into a self-service workbench that organizations can use to organize data, configure their operating model, and start working without a developer-led implementation.

## Product Thesis

The platform should let a philanthropic organization move from messy files and informal processes to a usable operating system in one guided session:

1. Create an organization.
2. Describe how the organization works.
3. Upload messy source data.
4. Let AI suggest mappings, modules, fields, workflows, and reports.
5. Review, approve, and safely commit changes.
6. Land in a configured workspace with clear next steps.

The goal is not arbitrary app generation. The goal is a trusted, configurable philanthropy workbench: users can shape grants, donors, holdings, compliance, tasks, reports, and AI behavior within the platform's supported capability envelope.

## Strategic Boundary

Self-service means org admins can configure their own system without code for:

- Module selection
- Data import and cleanup
- Custom fields
- Workflow checklists and stage requirements
- Automations
- Dashboard and table views
- Entity vocabulary
- Report templates
- Org-specific AI context

Self-service does not mean users can change security, RLS, audit trails, canonical compliance logic, arbitrary schema internals, or platform-level integrations. Those remain platform capabilities that require developer work.

## Phase Overview

| Phase | Name | What It Unlocks | Depends On |
|---|---|---|---|
| 0 | Product Packaging | Clear hosted/self-hosted model, plan limits, org templates | Current platform |
| 1 | Self-Service Workspace Setup | A user can create an org and get a useful starting workspace | Onboarding + modules |
| 2 | Data Workbench | A user can upload, map, validate, clean, commit, rollback, and export data | Import system |
| 3 | Runtime Configurability | A user can adapt workflows, fields, automations, views, vocabulary, and AI context | `CONFIGURABILITY_ROADMAP.md` |
| 4 | Workbench Home | A user sees data health, unresolved cleanup tasks, agent jobs, and recommended next steps | Phases 1-3 |
| 5 | Hosted Trust Layer | Backups, quotas, billing, audit, usage limits, privacy controls, and support workflows | Shared hosting architecture |
| 6 | Web + Mobile Experience | Responsive web, PWA, and shared mobile shell with org-specific branding | Stable API/config layer |

## Phase 0: Product Packaging

### What This Phase Enables

The platform has a clear self-service offer. Prospective users understand what they get, what is included, and what requires paid implementation or isolated infrastructure.

### Scope

**In:**
- Define hosted tiers: free/self-hosted, starter, operator, isolated.
- Define quotas: storage, imports, AI credits, users, workspaces, exports.
- Define org templates: private foundation, family office, DAF advisor, giving circle, nonprofit funder, fiscal sponsor.
- Define support boundaries and disclaimers for tax/legal/compliance workflows.
- Define data portability promise: full export, import history, and no lock-in.

**Out:**
- Final billing implementation.
- Mobile app.
- Full isolated tenant provisioning automation.

### Acceptance Criteria

1. A user can understand which plan fits their organization without talking to sales.
2. The app can enforce plan limits for imports, storage, AI usage, and member count.
3. The docs clearly distinguish platform guidance from legal, tax, accounting, or fiduciary advice.

## Phase 1: Self-Service Workspace Setup

### What This Phase Enables

A new user can create an org, select a template, answer a guided setup flow, and land in a non-empty workspace without developer involvement.

### Scope

**In:**
- Signup and organization creation.
- Org type selection.
- Module recommendations based on org type and goals.
- Guided setup conversation.
- Default dashboard, task list, sample reports, and recommended imports.
- Setup checklist that tracks progress.
- Builder handoff: "Here is how your workspace was configured."

**Out:**
- Complex data migration.
- Custom domains.
- Full billing.

### Acceptance Criteria

1. A new org admin signs up, creates an organization, chooses "private foundation," and lands in a dashboard with recommended modules, starter tasks, and a first import prompt.
2. The setup flow stores enough structured context for the Builder and AI assistant to explain why the workspace was configured that way.

## Phase 2: Data Workbench

### What This Phase Enables

Users can organize messy data themselves. The import system becomes an org-admin-facing workbench, not only an app-admin migration tool.

### Scope

**In:**
- CSV/XLSX upload for grants, donors, contributions, holdings, contacts, organizations, pledges, and tasks.
- File classification: detect likely entity type and source system.
- AI mapping assistant with row samples and reasoning.
- Validation and error browser.
- Duplicate detection and merge review.
- Staging before commit.
- Commit, partial commit, rollback.
- Import audit log.
- Data health score.
- Export center.
- Import templates by org type and source system.

**Out:**
- Fully automated PDF extraction.
- Guaranteed external data enrichment.
- Arbitrary user-defined entity imports.

### Acceptance Criteria

1. A user uploads a grant spreadsheet, approves suggested mappings, fixes validation errors, commits the import, and sees grants in the workspace.
2. A user can rollback the import and verify the records are removed.
3. The workbench shows a data health summary: missing EINs, duplicate organizations, invalid dates, unmapped columns, and records needing review.

## Phase 3: Runtime Configurability

### What This Phase Enables

Users can shape the platform around how they work. This phase is implemented by the existing `CONFIGURABILITY_ROADMAP.md`.

### Included Tracks

- Runtime workflow configuration
- Custom fields
- Configurable automations
- Org-specific AI behavior
- Configurable views and vocabulary
- Integrated onboarding and Builder summary

### Acceptance Criteria

Use the acceptance criteria in `CONFIGURABILITY_ROADMAP.md`. This roadmap should not duplicate that implementation detail; it depends on it.

## Phase 4: Workbench Home

### What This Phase Enables

The dashboard becomes the operating home for self-service users, centered on cleanup, configuration, and next actions.

### Scope

**In:**
- Data health score.
- Recent imports and rollback status.
- Records needing review.
- Duplicate review queue.
- Missing data queue.
- Active AI agent jobs.
- Suggested configuration improvements.
- Setup progress.
- Upcoming compliance, grant, pledge, and report tasks.

**Out:**
- Arbitrary dashboard design.
- Per-user dashboard preferences.

### Acceptance Criteria

1. A user can answer "what should I clean or configure next?" from the first screen.
2. Import issues, data health, pending Builder proposals, and task obligations are visible without visiting separate modules.

## Phase 5: Hosted Trust Layer

### What This Phase Enables

The platform can support low-cost hosted customers safely on shared infrastructure, while preserving a path to isolated infrastructure for larger organizations.

### Scope

**In:**
- Pooled multi-tenant hosting model.
- Strict org isolation checks and walkthrough tests.
- Per-org storage quotas.
- Per-org AI credit quotas.
- Billing and plan enforcement.
- Backup and restore process.
- Private document URLs.
- Audit and activity history.
- Export-all pathway.
- Admin telemetry for usage, cost, and failure modes.

**Out:**
- Customer-managed cloud accounts.
- White-glove infrastructure per starter customer.

### Acceptance Criteria

1. A starter org can run on pooled infrastructure with enforced storage, import, and AI limits.
2. A platform admin can see usage and cost drivers by org.
3. Tenant isolation is covered by automated walkthrough tests.

## Phase 6: Web + Mobile Experience

### What This Phase Enables

Users can access the workbench from web and mobile without creating a separate custom app for every organization.

### Scope

**In:**
- Responsive web UX for all critical workflows.
- PWA support for lightweight mobile access.
- Shared mobile app shell using the same API and org configuration.
- Org-specific branding after login.
- Mobile-first workflows: task review, grant status, document upload, notifications, approvals.

**Out:**
- Separate App Store apps per organization.
- Offline-first data editing.
- Mobile parity for every admin configuration flow.

### Acceptance Criteria

1. A user can review tasks, check grant status, upload a document, and respond to notifications from mobile.
2. The mobile shell reads org branding, vocabulary, and module config from the same configuration layer as web.

## Cross-Cutting Principles

### AI as Copilot, Not Autopilot

AI may suggest mappings, fields, workflows, automations, and reports. Destructive or structural changes require explicit human approval, preview, and audit logging.

### Data Portability

Every hosted workspace must have clean export paths. Low-cost infrastructure should not create lock-in.

### Configuration Over Forks

Cheap self-service only works if customer differences live in configuration records, not custom code forks.

### Trust Before Breadth

Data cleanup, rollback, permissions, audit trail, and exports are more important than adding more modules.

### Pooled by Default, Isolated When Needed

Starter and operator plans should run on pooled infrastructure. Larger customers can move to isolated databases or projects when risk, compliance, or scale justify the cost.

## Relationship to Current Roadmaps

| Existing Document | Role in Self-Service Roadmap |
|---|---|
| `PLATFORM_VISION.md` | Product philosophy and configuration promise |
| `CONFIGURABILITY_ARCHITECTURE.md` | Technical model for runtime configuration |
| `CONFIGURABILITY_ROADMAP.md` | Detailed implementation roadmap for Phase 3 |
| `AI_IMPORTER_BLUEPRINT.md` | Foundation for Phase 2 data workbench |
| `PROVISIONING.md` | Current white-glove deployment model; should evolve toward pooled self-service hosting |
| `docs/walkthroughs/` | Testing harness for self-service journeys |

## Suggested Next Specs

1. `self-service-workspace-setup-design.md`
2. `org-admin-data-workbench-design.md`
3. `hosted-trust-layer-design.md`
4. `mobile-shell-design.md`

Each spec should define schema, APIs, UI flows, Builder tools, limits, telemetry, tests, and acceptance criteria before implementation.
