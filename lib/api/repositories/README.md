# Repository Map

Each file in this directory owns server-side data behavior for one bounded
domain. Repositories are intentionally flat: callers get stable, predictable
imports, while this map provides the higher-level grouping. Every repository is
used only after the appropriate access guard proves the caller and tenant
scope; this directory is not a substitute for authorization.

## AI and organization configuration

- `ai-actions.ts`, `ai-chat.ts`, `ai-invocations.ts`, `ai-tools.ts` — durable
  assistant actions, conversations, invocation records, and tool data.
- `ai-credentials.ts`, `ai-routing.ts`, `ai-settings.ts` — organization AI
  connections, encrypted credentials, deployments, routes, and settings.
- `custom-fields.ts`, `metrics.ts`, `visualizations.ts` — configurable data,
  metric facts, widgets, and visualizations.
- `organization-dashboard.ts`, `organization-provisioning.ts` — dashboard data
  and organization lifecycle setup.

## Builder and implementation review

- `builder.ts`, `builder-apply.ts`, `builder-chat.ts`, `builder-reads.ts` —
  Builder proposals, constrained apply behavior, chat, and read models.
- `implementation-reviewers.ts` — reviewers authorized for implementation
  oversight.

## Imports, onboarding, and source documents

- `admin-uploads.ts`, `imports.ts`, `import-worker.ts` — administrative upload,
  import staging, and asynchronous import work.
- `onboarding.ts`, `onboarding-provisioning.ts`, `demo-seeding.ts` — first-run
  guidance, provisioning, and explicitly local/demo initialization.
- `generated-documents.ts`, `acknowledgment-pdfs.ts` — generated artifacts and
  acknowledgment PDF persistence.

## Organizations, membership, and public access

- `admin-directory.ts`, `memberships.ts`, `portfolio-memberships.ts` — member
  directories and organization/portfolio membership boundaries.
- `invitations.ts`, `public-invitations.ts` — authenticated invitation workflows
  and bearer-token public invitation resolution.
- `cpa-share.ts` — hashed-token CPA sharing and access logging.

## Portfolio, donors, and financial operations

- `holding-charities.ts`, `charities-admin.ts` — holding/charity relationships
  and platform-admin charity enrichment.
- `contribution-receipts.ts`, `pledges.ts`, `quickbooks.ts`, `tax.ts` — donor
  receipts, pledge schedules, accounting integration, and Tax Center data.
- `compliance.ts` — filings, registrations, payouts, and compliance operations.

## Grants, work, and delivery

- `grants.ts`, `workflows.ts` — grant lifecycle and configured workflows.
- `tasks.ts`, `task-jobs.ts` — transactional task mutations and task workers.
- `notifications.ts`, `notification-jobs.ts` — notification state and delivery
  jobs.

## Adding or changing a repository

1. Inspect `db/migrations/` and the generated database types before defining a
   new query or shape.
2. Choose the access guard that proves the caller and tenant scope, then pass
   that established context into the repository boundary.
3. Keep elevated operations inside this server-only boundary; never return
   organization AI credentials or other secrets to browser code.
4. Add a repository test under `lib/api/__tests__/` and focused route/contract
   coverage where the behavior crosses a product boundary.

See [API ownership](../README.md) for the route order and browser transport
rules.
