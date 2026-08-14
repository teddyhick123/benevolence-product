# Library Ownership

`lib/` contains product logic and shared boundaries. Start here when you know
the product domain; start in `app/` when you know the URL. This guide explains
where new code belongs without creating another source of truth for schema or
authorization.

## Domain map

| Location | Owns |
| --- | --- |
| `ai/` | Provider-neutral workloads, gateway/runtime, durable assistant state, prompts, tools, and action execution. |
| `api/` | Access guards, server/auth clients, browser transport, responses, rate limits, validation, and tenant-scoped repositories. See [API ownership](api/README.md). |
| `analytics/`, `dashboard/`, `visualizations/` | Portfolio summaries, analytics calculations, and visualization behavior. |
| `builder/` | Development-time Builder proposals, verification, and constrained change application. |
| `compliance/`, `grants/`, `pledges/`, `tax/` | Their respective product-domain calculations and workflows. |
| `custom-fields/`, `modules/`, `organizations/` | Configurable product shape, module metadata, organization scope/roles/context/view configuration. |
| `email/`, `notifications/`, `pdf/`, `reports/` | Delivery and output formats. |
| `holdings/`, `import/`, `integrations/`, `map/` | Holdings, import normalization, external integrations, and geospatial behavior. |
| `onboarding/` | Assistant and provisioning configuration for the first-run experience. |
| `schemas/` | Shared Zod input validation schemas. |
| `tasks/` | Task workflows, generated-task lifecycle, and automation outbox behavior. |
| `types/` | Shared application types that are not database schema mirrors. |
| `hooks/` | Generic browser/UI hooks only; domain data hooks live with their domain. |

The root files are intentionally limited to `database-client.ts`, generated
`database.types.ts`, and the browser-auth client under `lib/api/`
compatibility surfaces. New domain code does not belong at the root.

## Data and authority boundaries

Browser components and client pages do not query Supabase, call raw `fetch`, or
define their own SWR fetcher for domain data. Use this flow instead:

```text
client component
  → lib/<domain>/hooks.ts
  → lib/api/client.ts + lib/api/client-hooks.ts
  → guarded API route
  → require*Access guard
  → tenant-scoped repository
  → db/migrations canon through the typed database client
```

Server components may provide initial data when it is already available during
page composition. An organization or portfolio ID supplied by a client is a
routing input, never authorization; the server guard establishes the principal
and scope before a repository is constructed.

Read [API ownership](api/README.md) before adding a route, repository, or
browser data call. For the full browser-data protocol, see `AGENTS.md`.

## Placement rules

- Put domain behavior in its existing domain directory; add a new directory only
  for a real bounded domain.
- Put shared browser transport in `api/client.ts`, not a component helper.
- Put interactive GET ownership in `lib/<domain>/hooks.ts`; keep `hooks/` for
  generic UI behavior.
- Put database access behind a scoped repository under `api/repositories/`.
- Put external service adapters under `integrations/` or `services/`, never in a
  React component.
- Treat `db/migrations/` as the sole database schema canon. Do not create a
  schema mirror here or infer a table shape from UI types.

## Useful starting points

- [API ownership](api/README.md) — guards, transport, clients, and repository construction.
- [Repository map](api/repositories/README.md) — the intentionally flat repository directory, grouped by responsibility.
- [Architecture](../docs/engineering/ARCHITECTURE.md) — system-wide data, AI, module, and schema boundaries.
- [Agent instructions](../AGENTS.md) — mandatory schema, access, durable-AI, and testing protocols.
