# Module Development Template

This template demonstrates the current extension boundaries. Replace every
placeholder before using a file.

## Start with the schema decision

Do not create DDL just because one organization needs another field.

- A concept the platform itself consumes across organizations (reports, AI
  context, canonical views, shared workflows, or product features) belongs in
  the owning canonical table under `db/migrations/`.
- Organization-specific variability belongs in data: `custom_fields`,
  `metric_facts`, `widgets`, `org_view_config`, `configurable_automations`,
  `workflow_config`, or `organizations.modules` JSONB.
- Import staging is the only schema-variable surface, and only through its
  explicit dynamic allowlist.
- A genuine product increment gets a new `NNNN_name.sql` migration plus
  regenerated `lib/database.types.ts`. A prerelease correction to an existing
  object is folded into that object's owning migration.

## Implementation order

1. Add the app-facing module ID and its database-slug mapping in
   `lib/modules/types.ts`, `lib/modules/client-info.ts`, and
   `lib/modules/registry.ts`. Use that exact database slug with
   `org_has_module(p_org_id, p_module)`.
2. If shared schema is justified, adapt `db/migration.sql` into
   `db/migrations/NNNN_{module_name}.sql`, then regenerate database types.
3. Put elevated queries in a tenant-scoped repository such as
   `lib/{module_name}/repository.ts`. The repository constructor captures the
   authorized org or portfolio; callers cannot widen that scope.
4. Put org-scoped routes under `app/api/org/[orgId]/{module_name}/`. Each route
   calls `requireOrgAccess` before creating its repository and responds through
   `jsonOk`/`jsonError`.
5. Put browser data ownership in `lib/{module_name}/hooks.ts`. Use the shared
   transport in `lib/api/client.ts`; components do not call raw `fetch` or
   parse responses themselves.
6. Add provider-neutral tool definitions, a small executor under
   `lib/ai/assistant/executors/tools/`, and any elevated behavior to the
   authenticated `AssistantToolCapabilities` repository boundary. Any new AI
   invocation must use a stable workload and `lib/ai/runtime.ts`; module code
   must not choose a provider, model, or credential.
7. Preserve assistant durability: the chat route owns `ai_turns` request-ID
   idempotency, normalized `ai_messages`, and action persistence. A module tool
   must not create a parallel conversation store or bypass turn finalization.

## Target layout

```text
db/migrations/NNNN_{module_name}.sql
lib/{module_name}/repository.ts
lib/{module_name}/hooks.ts
lib/ai/assistant/executors/tools/{tool-name}.ts
app/api/org/[orgId]/{module_name}/route.ts
app/api/org/[orgId]/{module_name}/[id]/route.ts
components/{module_name}/
app/org/[orgId]/{module_name}/page.tsx
```

## Verification checklist

- [ ] Schema decision is recorded: canonical platform field or sanctioned data/config extension.
- [ ] Migration and generated database types change together when DDL is added.
- [ ] New org-scoped tables use `org_id`, RLS, grants, indexes, and `set_updated_at`.
- [ ] Route proves access before an elevated repository is constructed.
- [ ] Repository captures tenant scope and filters every query by it.
- [ ] Browser component uses a domain hook and shared transport.
- [ ] AI mutation uses validated input, scoped capabilities, and action tracking.
- [ ] AI retries reuse the existing durable turn/message idempotency path.
- [ ] Module filtering hides tools and routes when the module is disabled.
- [ ] `npm run verify:hygiene`, focused contracts, and the normal verification suite pass.
