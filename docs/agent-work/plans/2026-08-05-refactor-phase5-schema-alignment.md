# Phase 5 — Canonical Schema Alignment Implementation Plan

**Spec:** `docs/agent-work/specs/2026-07-26-full-refactor-design.md`

**Findings:** `docs/agent-work/specs/2026-07-26-refactor-findings.md`

**Status:** Complete

## Goal

Make the clean prerelease database satisfy every active application data
contract while preserving the access, repository, grant-lifecycle, and AI
durability boundaries established in Phases 2–4.

This phase replaces the former client data normalization Phase 5. Client-side
fetch normalization moves to Phase 6 because a correct, typed, reproducible
database contract is the higher-value prerequisite. There is no deployed/client
data to migrate, so the active migration set should be optimized for its final
shape instead of retaining compatibility patches.

## Execution prerequisite

Phase 5 depends on the Phase 2 tenant-scoped repositories, Phase 3 durable AI
turns/messages, and Phase 4 holding/grant boundaries. Those prerequisites were
reviewed and merged before Phase 5 implementation began; this phase extends
their boundaries rather than replacing them.

## Canonical rules

1. `db/migrations` remains the only schema source of truth.
2. Fold corrections into the migration that owns the object. Do not add a new
   patch migration merely to preserve prerelease history.
3. Do not recreate obsolete tables, aliases, FK paths, or RPCs just because code
   still references them. Align the code when a canonical replacement exists.
4. Add a column/table only when it represents stable platform semantics consumed
   by shared reports, AI context, canonical views, cross-org behavior, or other
   typed platform contracts. Org-specific/client-variable fields use custom
   fields and values; they never produce per-client DDL.
5. Add a view when a reusable derived read contract benefits multiple consumers;
   use `WITH (security_invoker = true)` and explicit grants.
6. Add a database function only when the operation must be atomic, reusable, or
   protected by a narrowly scoped security boundary. Do not add generic SQL
   execution functions.
7. Application routes keep the Phase 2 guard and repository boundaries. Routes
   do not gain direct service-role clients during alignment.
8. Grant lifecycle mutations continue through `lib/grants/lifecycle.ts` and
   organization-scoped grant mutation routes.
9. Phase 3 `ai_sessions`, `ai_turns`, `ai_messages`, request uniqueness, durable
   completion, action linkage, and at-most-once tool-side-effect contracts are
   part of the schema canon and must not regress.
10. Dynamic import staging tables must use an explicit typed adapter/allowlist;
    they are not a reason to leave the general database client untyped.

## Extensibility boundary

Schema alignment must strengthen the platform's sanctioned extension points,
not turn every customer request into another canonical column. Foundations own
and extend their stack through data and configuration:

- `org_custom_field_definitions` and `org_custom_field_values` for org-specific
  grant, holding, donor, and contribution fields;
- `kpi_definitions` and `metric_facts` for user-defined impact measures;
- `widgets` and `org_view_config` for presentation and layout;
- `org_automation_rules` and `workflow_config` for configurable operations;
- `organizations.modules` for enabled product capabilities; and
- validated JSONB configuration where the platform intentionally defines a
  configuration envelope.

The generated `Database` type covers the stable platform canon. Per-org
variability remains rows in these extension tables or values inside validated
configuration, so all clients share one schema. Dynamic import staging is the
only schema-variable surface and stays behind its explicit adapter/allowlist.

Promoting an org-defined concept into the platform canon requires evidence that
the platform itself now gives it stable shared semantics. Repeated customer use
alone is not enough; the product must define its meaning, type, lifecycle,
authorization, and cross-feature behavior.

## Mismatch decision matrix

| Mismatch | Resolution |
|---|---|
| Stable field is consumed by shared reports, AI context, canonical views, or cross-org features and has no storage | Add it to the owning canonical table definition |
| Field is org-specific, optional by customer, or varies in meaning/workflow | Store it through `org_custom_field_definitions`/values; never add per-client DDL |
| Variability is a KPI, view, workflow, automation, or module choice | Use the matching sanctioned extension primitive rather than a canonical column |
| Code uses an alias of an existing column | Change code to the canonical column |
| Code follows an obsolete relationship | Change the query/mutation to the canonical FK path |
| Reusable derived read is missing | Add a security-invoker view |
| One repository needs a simple aggregate | Calculate it in the scoped repository |
| Mutation must be concurrency-safe | Add a narrow authorized database function |
| Feature expects unsafe/dead infrastructure | Redesign it without recreating that infrastructure |
| Prerelease correction to an existing canonical object | Fold it into that object's owner migration |
| New product increment extends an existing object | A newly numbered migration is correct, including for Builder proposals |

## Confirmed baseline decisions

These decisions turn the current known mismatches into explicit work rather than
allowing implementation to choose ad hoc schema additions.

| Current mismatch | Canonical direction |
|---|---|
| Holding detail expects embedded primary-contact fields | Add a first-class `holding_contacts` child table with multiple contacts, roles, one primary contact, contact-owned photo/notes, and parent-holding scope; keep the current UI through a primary-contact view model |
| Holding detail expects `theory_of_action` | Add it to canonical `holdings`; it has stable platform meaning in shared holding narrative, reports, and AI context |
| Active letter/holding code reads `holdings.nav` | Use canonical `current_value`; do not add `nav` |
| Active code reads/writes `holdings.charity_id` | Use `holdings.investee_id → investees.charity_id`; do not add a duplicate direct FK |
| Donations directly embed `tax_contributions` under `holdings` | Query through `holding_contributions` |
| `v_portfolio_kpi_series` is referenced but absent | Add a typed security-invoker KPI series view in the KPI migration |
| `get_portfolio_latest_kpis_sum` is referenced but absent | Prefer a scoped repository aggregation over the canonical KPI view |
| `get_top_kpis_per_holding` is referenced but absent | Prefer a scoped repository query/grouping over `v_portfolio_kpi_latest` |
| `generate_risk_snapshot` is referenced but absent | Add a narrow authorized, atomic snapshot function in the analytics migration |
| `v_portfolio_donation_summary` is referenced but absent | Add a reusable security-invoker portfolio donation summary view after canonical linkage is fixed |
| Letter generation uses nonexistent `generated_letters` | Extend `generated_documents` with a `letter` type and structured content/version behavior |
| Profile code queries nonexistent `admins` | Use the shared app-admin access/RPC boundary; do not add an `admins` table |
| Membership code calls nonexistent `owner_count_for_portfolio` | Use a scoped repository count unless concurrency analysis requires an atomic last-owner mutation function |
| Demo loading calls nonexistent `exec_sql` | Keep the URL only as a safe typed adapter if still needed; never add arbitrary SQL execution |
| Recommendation validators disagree with `text[]`/JSONB columns | Align create/update validation and types to the canonical schema |
| `.storage.from('imports')` appears in static relation inventories | Treat it as the valid private storage bucket, not a missing relational table |
| QuickBooks status exposes `connected_at`/`token_expiry` | Keep them as response aliases mapped from canonical `created_at`/`expires_at` columns |

The full sweep may discover additional mismatches. Each new entry must be added
to the findings log with the same classification before it is implemented.

## Task 1 — Establish an executable database contract

1. Add a reproducible script that generates `lib/database.types.ts` from a clean
   local database.
2. Commit the generated file and add a drift check that regenerates to a
   temporary path and fails when the committed types differ. Run it after the
   reset inside `verify:migrations`, not only in general CI.
3. Mirror the invariant into `tests/integration/builder-schema-contract.test.ts`:
   it must prove that every `db/migrations/**` proposal selects the schema suite
   and `verify:migrations`, and that the post-reset assertion invokes the type
   drift check. This is the sanctioned shared-infrastructure touch to
   `lib/builder/check-matrix.ts` if routing changes are needed.
4. Require Builder migration proposals to include/regenerate
   `lib/database.types.ts`; otherwise their isolated verifier fails and returns
   the proposal to repair instead of allowing stale types to merge.
5. Parameterize shared Supabase client types, including `SessionClient`, with the
   generated `Database` type.
6. Type tenant-scoped repositories and their selected row/result shapes. Remove
   `any` casts used only to hide schema drift as each domain is touched.
7. State and test the type boundary: generated types describe the platform canon;
   org-specific fields/KPIs/layout/workflows/modules remain typed extension data,
   and only the import-staging adapter may select a schema-variable relation.
8. Add a contract that inventories active `.from()` relations and `.rpc()` calls
   against the generated schema. It must distinguish relational clients from
   storage buckets and document the small dynamic-table allowlist.
9. Extend the schema-contract suite to prevent duplicate canonical definitions,
   but do not blanket-ban `ALTER TABLE ... ADD COLUMN` in later migrations.
   Maintainer corrections to prerelease objects must fold into the owner
   migration; a Builder/new product increment must use a new migration because
   `lib/builder/path-policy.ts` correctly forbids rewriting existing migrations.
   Encode/document that distinction so valid extension proposals are not blocked
   by a migration-archaeology rule.

**Exit:** invalid static relations, columns, relationships, RPC names, and RPC
arguments fail locally and in CI before a route can ship.

## Task 2 — Align holdings, investees, and charities

1. Add `theory_of_action` to `holdings` in `0006_holdings.sql` because it is a
   stable platform narrative used by the holding workspace, reports, imports,
   and AI context.
2. Add `holding_contacts` beside the holding model rather than embedding six
   single-contact columns. Follow the established `grant_contacts` pattern with
   a holding FK, name, email, phone, role, organization, photo storage path,
   notes, timestamps, and `is_primary`.
3. Enforce at most one primary contact per holding with a partial unique index;
   scope read/write policies through the parent holding and include explicit
   authenticated/service-role grants.
4. Define length/format constraints only where the application already has an
   equivalent validation rule; avoid database constraints that reject legitimate
   international contact data.
5. Adapt the existing single-contact UI through the holding repository/view model:
   it reads the primary row and upserts that row for current forms. Multiple
   contacts and roles become available without requiring a Phase 5 UI expansion.
6. Move contact photo upload ownership and notes writes to the contact row, with
   deterministic behavior when a primary contact does not yet exist.
7. Replace every `nav` read with `current_value` and update view models/response
   aliases without adding a database alias.
8. Replace direct holding-to-charity reads and writes with the canonical investee
   relationship. Link/unlink operations must create, reuse, or update the
   appropriate investee row through a scoped repository.
9. Repair report generation, financial profiles, charity linking, holding detail,
   and any embedded relationship selects that depend on the old direct FK.
10. Verify contact-photo object ownership, signed access, replacement, and cleanup
   behavior against the holding/portfolio access boundary.

**Exit:** the holding detail journey works on a clean database; no active code
references embedded `primary_contact_*` columns, `holdings.nav`, or
`holdings.charity_id`; all contact and charity operations use their canonical
relationships.

## Task 3 — Align metrics and analytics

1. Add `v_portfolio_kpi_series` to `0008_metrics_and_kpis.sql`, sourced from
   `metric_facts`, `holdings`, and `kpi_definitions`, with the response fields the
   route actually supports.
2. Make KPI views security-invoker views and grant only the privileges needed by
   authenticated and service-role consumers.
3. Replace missing KPI aggregate/top-KPI RPC calls with methods on a typed,
   portfolio-scoped metrics repository unless measured query requirements justify
   a database function.
4. Implement `generate_risk_snapshot(p_portfolio_id)` in
   `0035_analytics_module.sql`. It must:
   - require portfolio edit access for authenticated callers;
   - calculate the complete snapshot deterministically;
   - upsert one row per portfolio/date atomically;
   - return the snapshot id;
   - expose a precise function signature and explicit grants.
5. Remove silent fallback behavior that treats an absent/broken snapshot function
   as success. On-the-fly read-only calculations may remain an explicit fallback,
   but persistence failures must be observable.

**Exit:** KPI series, dashboard aggregates, map KPIs, snapshot generation, retry,
and history reads pass against a clean database with correct tenant isolation.

## Task 4 — Align donations and tax contribution linkage

1. Rebuild donation reads through
   `holdings → holding_contributions → tax_contributions`.
2. Make `has_tax_contribution` filtering operate on that canonical join rather
   than an inferred nonexistent relationship.
3. Add `v_portfolio_donation_summary` in the migration that owns the donation/tax
   relationship. The view must be security-invoker and aggregate only rows visible
   through base-table RLS.
4. Verify contribution types, amount fields, tax year, recipient data, and QCD
   semantics against the canonical Tax Center constraints.
5. Preserve explicit `can_view_portfolio`/`can_edit_portfolio` route checks so
   unauthorized requests return 403 rather than an ambiguous empty result.

**Exit:** donation list, filters, summary, and linked tax contribution responses
match their runtime schemas and cannot cross portfolio boundaries.

## Task 5 — Align reports, letters, administration, and memberships

1. Extend `generated_documents.document_type` with `letter` rather than creating
   `generated_letters`.
2. Define the letter content envelope, summary metadata, generated-by attribution,
   and version rules once. Add a version column/uniqueness constraint only if the
   existing UI requires stable historical versions.
3. Route letter generation and retrieval through the reports repository while
   preserving current URL and response behavior.
4. Replace the profile `admins` query with the existing app-admin access helper or
   `is_app_admin()` RPC through a shared repository.
5. Move owner counting into the membership repository. If concurrent remove and
   demote operations can both pass a count check, implement a single authorized
   atomic mutation function rather than a count-only RPC.
6. Replace the demo loader's `exec_sql` dependency with a typed, canonical demo
   seeding service or disable the adapter outside the local/demo environment.
   Never expose a generic SQL executor.

**Exit:** no active code references `generated_letters`, `admins`, `exec_sql`, or
`owner_count_for_portfolio`; letter history and last-owner protection remain
behaviorally intact.

## Task 6 — Complete the domain-by-domain sweep

Audit each domain against the clean schema and generated types:

1. organizations, modules, memberships, and portfolios;
2. holdings, investments, investees, charities, and news;
3. grants, grant operations, workflows, and tasks;
4. donors, gifts, pledges, acknowledgments, and foundation payout;
5. Tax Center, documents, carryforwards, and CPA sharing;
6. reports, templates, exports, schedules, and generated documents;
7. metrics, widgets, analytics, projections, and risk;
8. compliance, filings, reviews, conflicts, and expenditure responsibility;
9. imports, staging, reconciliation, storage, and audit records;
10. QuickBooks connections, accounts, transactions, sync logs, and export
    attempts;
11. AI sessions, turns, messages, actions, idempotency keys, and tool linkage;
12. custom fields, view configuration, notifications, and Builder-owned schema
    consumers.

This is not budgeted as twelve independent manual source audits. Task 1 turns
missing tables, columns, relationships, and RPC signatures into a compiler-driven
worklist. Manual review is reserved for semantics generated types cannot prove:
RLS behavior, grants, check constraints/enums, FK delete behavior, concurrency,
function volatility/security/search path, and whether variability belongs in a
sanctioned extension primitive instead of DDL.

For every table/view/function, check:

- canonical ownership column and FK path;
- selected, inserted, updated, and ordered columns;
- nullability, defaults, generated columns, and soft-delete behavior;
- enum/check values and matching runtime validators;
- FK delete semantics and uniqueness/concurrency constraints;
- view `security_invoker` mode and base-table RLS behavior;
- table policies, service-role policies, grants, and function execute grants;
- exact RPC parameter names, return shapes, volatility, and search path;
- route-level explicit access checks and tenant-scoped repository predicates.

**Exit:** every discovered mismatch is either fixed or explicitly deferred in the
findings log with an owner, rationale, and protected fallback behavior.

## Task 7 — Consolidate the active migration canon

1. Fold prerelease corrections to existing fields, constraints, views, functions,
   triggers, policies, and grants into the migration that owns the domain.
2. Consolidate duplicate table/view/function definitions where dependency order
   permits.
3. Remove compatibility aliases and unused objects that no active product code
   requires.
4. Keep later migrations when they express a real dependency boundary or a
   distinct product increment. New Builder features that extend an existing table
   correctly use a newly numbered migration; they are not treated as corrective
   migration archaeology.
5. Update `AGENTS.md`, architecture/module documentation, generated types, schema
   contracts, and the findings log to describe the resulting canon.

**Exit:** a reviewer can determine the complete current definition of an object
from its canonical owner migration without reconstructing a patch history.

## Task 8 — Clean-database and access verification

Run the complete gate from an empty local database:

1. `npm run walkthrough:doctor`, then `npm run walkthrough:reset`;
2. generated database type drift check;
3. schema, privilege, access-boundary, grant-lifecycle, and AI durability contract
   suites;
4. `npm run verify:types`;
5. lint at or below the current warning floor;
6. full Vitest suite and production build;
7. representative authenticated read/write journeys for every enabled module;
8. holdings, grants, donations, reports/letters, analytics, tax, imports, and AI
   walkthrough journeys;
9. direct URL/API denial, invalid input, stale tabs, interrupted operations, and
   repeated/idempotent submissions;
10. a second clean reset and focused smoke run to prove reproducibility.

The AI journey must explicitly prove that schema alignment has not weakened the
Phase 3 contract: the user turn is durably begun once, the assistant result is
durably completed once, replay is deterministic, and committed tool side effects
remain at most once.

## Commit sequence

Keep implementation reviewable and green in this order:

1. generated database types and schema drift guardrails;
2. holding contacts/theory, investee, and charity canonical alignment;
3. metrics and analytics views/functions/repositories;
4. donations and tax linkage;
5. reports/letters, app admin, memberships, and safe demo adapter;
6. recommendation validation plus remaining domain sweep corrections;
7. RLS/privilege hardening, migration consolidation, documentation, and final
   clean-reset evidence.

Security fixes discovered during the sweep remain dedicated commits. Other
schema-alignment behavior corrections may change previously broken behavior but
must include a regression test and findings-log resolution in the same commit.

## Phase exit criteria

Phase 5 is complete only when:

- a clean reset creates every active relation, column, relationship, view, and
  RPC with the expected type and privilege contract;
- generated types are current and all shared database clients/repositories are
  typed, except for a documented dynamic staging adapter;
- active code contains no references to the confirmed nonexistent objects or
  obsolete aliases listed above;
- no compatibility column duplicates an existing canonical concept;
- org-specific variability remains in sanctioned custom-field, KPI, view,
  workflow, automation, module, or validated configuration data rather than
  per-client DDL;
- Builder migration proposals cannot pass isolated verification with stale
  generated database types, and legitimate product-increment migrations are not
  blocked by correction-folding rules;
- every security-sensitive view is security-invoker and every route retains an
  explicit access/repository boundary;
- grant transitions still record canonical status history;
- AI message persistence, request idempotency, and tool-side-effect at-most-once
  contracts remain green for streaming and non-streaming transports;
- representative module journeys pass from a freshly reset database twice; and
- the findings log records each mismatch as resolved, deliberately deferred, or
  disproven.

## Deferred Phase 6

After schema alignment, client-side data normalization can proceed against stable
typed response contracts: shared JSON transport, per-domain SWR hooks, named
upload/download/stream helpers, and consolidation of hook locations. It should
not be pulled into Phase 5 except where a touched client must change to consume a
corrected canonical response.

## Completion evidence

- The canonical migrations reset cleanly from zero twice; post-reset assertions
  report 135 public tables and generated database types match the live schema.
- The generated-type compiler audit and production build pass.
- The full Vitest suite passes (2,509 tests; six live-environment tests skipped),
  including schema, privilege, Builder, access-boundary, grant-lifecycle, and AI
  persistence/idempotency contracts.
- Lint passes at the approved 467-warning ceiling with no errors.
- The seeded walkthrough smoke set covers all nine journeys; eight passed in the
  initial run and the one transient module-gating timeout passed on focused retry.
- All variable relational selection is confined to the import adapter's closed
  staging/target allowlist; fixed Builder relations and storage buckets remain
  statically owned surfaces.

## Post-review hardening

The completed implementation received a second review before merge. The review
found one stale contract assertion plus several behaviors that source-regex
checks could not prove. Phase 5 therefore also includes:

- a security-invoker donation listing view whose SQL `EXISTS` predicate replaces
  unbounded link-ID materialization and always excludes soft-deleted holdings;
- a portfolio-anchored donation summary that scopes tax contributions and
  carryforwards through live donation holdings, returns a zero-valued row for an
  empty portfolio, and reports appreciated gain without inventing a tax rate;
- transactional generated-letter version allocation under a portfolio advisory
  lock, with malformed cached documents skipped independently of versioning;
- a narrow `link_holding_to_charity` capability that validates portfolio edit
  access, accepts only an existing canonical charity, serializes investee
  materialization, and removes the route's elevated global-catalog client;
- separate staging and production-target import adapters, so a staging route
  cannot accidentally select a canonical target table through a union allowlist;
- generic infrastructure errors for member administration, stable risk snapshot
  creation timestamps, corrected tax canon documentation, and an explicit test
  of the `@supabase/ssr` browser-client delegation introduced by the typed-client
  work; and
- transactional live-schema assertions for donation scoping/empty summaries,
  generated-letter versioning, idempotent charity linking, and risk snapshot
  timestamp stability, run after every clean reset alongside generated-type
  drift checks.

The typed-client contract is intentionally structural: generated relation,
column, view, RPC, and RPC-argument names are exact, while values, RPC returns,
and write-requiredness remain relaxed behind domain validators. Phase 5 does not
claim that the wrapper provides exact generated value types.
