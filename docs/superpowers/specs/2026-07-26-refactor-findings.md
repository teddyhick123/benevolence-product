# Refactor Findings — Behavior Quirks Log

**Spec:** [2026-07-26-full-refactor-design.md](2026-07-26-full-refactor-design.md)

Non-security behavior quirks discovered during the refactor are logged here
instead of fixed. Security bugs are fixed in dedicated commits with regression
coverage — see the spec's bug policy.

This file is the historical discovery and evidence log. Continue recording new
findings here, but triage every still-open action into the
[consolidated backlog](../../module-reviews/FULL-BACKLOG.md) and maintain its
priority/status there.

Each entry: date, phase/task, `file:line`, what the code actually does versus
what was expected, and why it was left alone.

## Findings

### 2026-07-27 — Phase 1, Task 7 — `.github/workflows/walkthrough-smoke.yml`, `tests/walkthrough/journeys/`

**What happened:** On PR #19 (Phase 1 guardrails), the `walkthrough-smoke` job ran
22/22 executed Playwright tests green (9 smoke + 13 journey specs) but was
canceled by GitHub Actions' 30-minute job timeout mid-way through the final
journey batch (`##[error]The operation was canceled.` at 23:19:43, after
starting a 6-test batch at 23:15:14). No test assertion failed.

**Expected vs. actual:** The Phase 1 plan (Task 7 Step 4) expects `Walkthrough
Smoke` green alongside `CI / verify`. It is not: the job is already broken on
`main` independent of this PR — the push run at the Phase 1 merge-base commit
(`53731cb1`, run 30221081802) failed `npm run walkthrough:journeys` with exit
code 1 in 17m14s, and `gh run list` shows repeated intermittent failures on
`main` going back to at least 2026-06-19 (roughly half of the last 14 runs
failed, with durations ranging 5m35s–17m14s even on green runs approaching the
current PR's 30-minute ceiling).

**Why left alone:** This phase is infrastructure-only (lockfile, CI gate, test
conventions) and touches no product code, Playwright config, or walkthrough
scripts — nothing in the Phase 1 diff can explain either failure mode. The
underlying issue (suite duration/flakiness in `tests/walkthrough/journeys/`,
possibly compounded by the added `cache: npm` step's first-run cache-miss
overhead) is pre-existing and orthogonal to the guardrails this phase lands.
Not a security bug, so per the spec's bug policy it's logged, not fixed, here.
Phase 1's actual CI gate (`.github/workflows/ci.yml`'s `verify` job) is green on
both the push and pull_request triggers.

**Suggested follow-up (not scheduled):** A later phase or a dedicated ticket
should either raise `walkthrough-smoke`'s `timeout-minutes`, split the journeys
job to parallelize, or investigate why suite duration has crept toward the
30-minute ceiling.

### 2026-07-29 — Phase 2, Admin Upload family — ignored `autoApprove` input

**What happened:** Both upload UIs send `autoApprove=true`, and
`lib/schemas/admin.ts:7-10` accepts the same option for the reprocessing route,
but neither ingestion path reads it. Extracted facts always remain in
`staging_metric_facts` for manual review.

**Expected vs. actual:** The field name implies that a successful ingestion can
promote facts automatically. Actual behavior is manual approval regardless of
the supplied value.

**Why left alone:** Automatically promoting AI-extracted facts changes a
high-impact review control and requires an explicit product decision. The API
and authorization refactor preserves the manual-review behavior.

**Suggested follow-up (not scheduled):** Remove the unused option from the UI
and schema, or define a role-gated bulk approval workflow with audit history.

### 2026-07-29 — Phase 2, Admin Upload family — holding uploader AI-off mode is unrestricted

**What happened:** `components/holdings/ReportUploader.tsx:104-110` submits
`ai_mode=false` without any `selected_metrics`. The extractor treats an empty
restriction list as unrestricted (`lib/ai/document-extractor.ts:50-52`), so the
toggle can still discover any KPI.

**Expected vs. actual:** The admin upload page describes AI-off mode as limiting
extraction to selected KPIs. The holding-level uploader exposes the same toggle
without a KPI selector, so its off state does not enforce that restriction.

**Why left alone:** Choosing whether AI-off means "do not extract" or "extract
only configured KPIs" is a product behavior decision outside the boundary
refactor. Existing extraction behavior was retained.

**Suggested follow-up (not scheduled):** Add the configured-KPI selector to the
holding uploader or remove the toggle there and route non-AI uploads through a
document-only storage flow.

### 2026-08-01 — Phase 2, dashboard family — failed counts render as zero

**What happened:** `app/api/org/[orgId]/dashboard/route.ts:73-78` deliberately
turns any count-query error into `0`. Several other dashboard reads also use
empty fallbacks when their query fails.

**Expected vs. actual:** A zero normally means the organization has no matching
records. During a database or policy failure, the dashboard can show the same
zero instead of indicating that the statistic is unavailable.

**Why left alone:** Changing partial dashboard degradation into a request-level
failure or per-card error state is a product reliability decision, not an API
boundary change. The refactor retained the current response contract.

**Suggested follow-up (not scheduled):** Return availability metadata per
statistic and render an unavailable state separately from a real zero.

### 2026-08-01 — Phase 2, visualization family — widget positions use max-plus-one

**What happened:** `lib/api/repositories/visualizations.ts:45-61` and `:69-85`
read the current maximum widget position and then insert `max + 1` in a separate
operation.

**Expected vs. actual:** Sequential saves produce stable ordering. Concurrent
saves can read the same maximum and receive the same position because the
schema has no uniqueness constraint or atomic allocator for that ordering.

**Why left alone:** The scoped repository preserves existing ordering behavior;
introducing an RPC, lock, or uniqueness/retry policy would be a separate data
model decision.

**Suggested follow-up (not scheduled):** Allocate positions in a transaction or
use a uniqueness constraint with retry/rebalancing.

### 2026-08-01 — Phase 2, milestone family — task sync follows the status write

**What happened:** The milestone route updates `grant_milestones` and then calls
the org-scoped generated-task synchronizer
(`app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts:65-79`).

**Expected vs. actual:** Under normal operation both changes succeed. If task
synchronization fails, the API returns 500 after the milestone status has
already been saved, so the response does not describe the committed state.

**Why left alone:** The ordering predates this refactor and the task writer is
designed for repeatable source-prefix operations. Making both systems atomic
requires a database orchestration boundary beyond this route migration.

**Suggested follow-up (not scheduled):** Move milestone status change and task
state transition into one database function or persist an outbox event for
retryable synchronization.

### 2026-08-01 — Phase 2, notification family — nested preferences merge shallowly

**What happened:** The notification preference endpoint accepts partial
`channels` and `alerts` objects, but `lib/api/repositories/notifications.ts`
merges only the top-level preference keys. Sending one nested channel therefore
replaces the stored `channels` object instead of preserving its sibling value.

**Expected vs. actual:** A partial update such as `{ channels: { email: false }
}` may be expected to retain the existing `in_app` choice. Existing behavior
stores only the supplied nested object.

**Why left alone:** Deep-merging changes the endpoint's established update
semantics and could retain values callers intended to replace. The API boundary
refactor preserves the shallow merge.

**Suggested follow-up (not scheduled):** Define whether nested preference
objects are patches or replacements, then align the schema, implementation, and
client payloads with that contract.

### 2026-08-01 — Phase 2, notification jobs — delivery scan errors look empty

**What happened:** `lib/api/repositories/notification-jobs.ts` reads pending and
retryable email notifications concurrently but, matching the prior route, uses
only each result's `data` and does not inspect its `error`.

**Expected vs. actual:** A failed queue read may be expected to fail the worker
run so it can be retried or alerted. Actual behavior treats the failed result as
an empty list and can return `ok: true` with zero work.

**Why left alone:** Changing the worker's success/failure contract affects
monitoring and retry behavior outside the API-boundary extraction. The refactor
keeps the existing semantics.

**Suggested follow-up (not scheduled):** Fail the run when either queue read
errors, and add job monitoring that distinguishes an empty queue from a failed
scan.

### 2026-08-01 — Phase 2, pledge family — installment task sync is post-commit

**What happened:** The installment status RPC commits the pledge/installment
change before `lib/api/repositories/pledges.ts` synchronizes generated tasks.

**Expected vs. actual:** Under normal operation both states agree. If generated
task synchronization fails, the endpoint returns 500 even though the installment
status and pledge event have already committed.

**Why left alone:** Making the pledge mutation and task updates atomic requires
expanding the database RPC or introducing an outbox/retry boundary. The scoped
repository preserves the existing ordering.

**Suggested follow-up (not scheduled):** Fold task synchronization into the
installment RPC or persist a retryable domain event in the same transaction.

### 2026-08-01 — Phase 2, workflow family — task synchronization compensates best-effort

**What happened:** `lib/api/repositories/workflows.ts` updates a workflow task,
its linked task, a task event, and potentially the workflow instance in separate
operations. On a later failure it attempts to restore the three mutable rows,
but does not verify those compensation writes or remove an event that may
already have been inserted.

**Expected vs. actual:** The endpoint tries to present one logical update, but a
database failure between operations can leave state or audit history partially
advanced even when the response is 500.

**Why left alone:** The scoped repository preserves the existing compensation
sequence. True atomicity requires a database function or transactional outbox,
which is beyond an API authorization boundary change.

**Suggested follow-up (not scheduled):** Move the workflow-task, linked-task,
workflow-instance, and task-event changes into one transactional database RPC.

### 2026-08-01 — Phase 2, task jobs — run-log write failures are ignored

**What happened:** `lib/api/repositories/task-jobs.ts` preserves the worker's
existing behavior of awaiting the advisory-lock, run insert, and terminal run
update without checking their returned database errors.

**Expected vs. actual:** The automation producers may complete successfully
while the run-history row is missing or remains marked `running`. Conversely, a
producer failure may be returned to the caller without a corresponding failed
run record for monitoring.

**Why left alone:** Making run-history persistence part of the worker's success
contract changes retry and alerting behavior. The API-boundary extraction keeps
the established execution semantics while restricting elevated access to the
task-job principal.

**Suggested follow-up (not scheduled):** Check every lock/run-log result and
define whether log persistence failure should abort generation, retry the log,
or emit a separate monitoring alert.

### 2026-08-01 — Phase 2, task family — mutation compensation is partial

**What happened:** `lib/api/repositories/tasks.ts` preserves the existing
multi-step task mutations: task/link/comment writes, audit-event inserts, grant
milestone reverse synchronization, and automation triggers occur as separate
database operations. Failure handlers attempt selected rollbacks but do not
verify those writes. A completed grant milestone is not restored if the later
task-event insert fails.

**Expected vs. actual:** The endpoints present each action as one logical
mutation, but an intermediate database failure can leave task, audit, comment,
link, or milestone state partially advanced even when the response is 500.

**Why left alone:** The scoped repository keeps the established ordering and
response behavior. Making these cross-table effects atomic requires a database
function or transactional outbox, beyond the API authorization refactor.

**Suggested follow-up (not scheduled):** Move task mutation plus audit and
milestone synchronization into transactional database functions, and dispatch
automation from a durable outbox after commit.

### 2026-08-01 — Phase 2, acknowledgments — PDF replacement is not atomic

**What happened:** The acknowledgment PDF flow uploads with `upsert: true`, then
updates the letter row, then creates a signed URL. On a row-update failure it
removes the uploaded path; on a signing failure it leaves the new path stored.

**Expected vs. actual:** A regeneration may replace an existing PDF before the
database update succeeds, and the cleanup can then remove that replacement
without restoring the prior object. A signing failure returns 500 even though
the document and database path have already been saved.

**Why left alone:** The scoped storage repository preserves the existing
failure and retry behavior while constraining every object path to the
authorized organization. Atomic object replacement needs a versioned-path or
staging design.

**Suggested follow-up (not scheduled):** Upload to a versioned temporary path,
commit that path to the letter row, then retire the previous object after a
successful signed-URL response or through cleanup automation.

### 2026-08-02 — Phase 2, memberships — audit compensation is best-effort

**What happened:** `lib/api/repositories/memberships.ts` preserves the existing
sequence of changing a membership and then inserting an audit row. If auditing
fails, it attempts to restore the prior role or soft-deletion state but does not
check whether that restoration succeeds.

**Expected vs. actual:** Membership mutations are presented as durable audited
actions, but a second database failure can leave the membership changed without
the corresponding audit event even though the endpoint returns 500.

**Why left alone:** The scoped repository retains the established fail-closed
response and compensation behavior. True atomicity requires a database
transaction boundary rather than route-level orchestration.

**Suggested follow-up (not scheduled):** Move member addition, role changes,
removal, last-owner checks, and audit insertion into transactional database
functions.

### 2026-08-02 — Phase 2, invitations — delivery compensation is best-effort

**What happened:** `lib/api/repositories/invitations.ts` preserves the existing
multi-step invitation flow: persist or rotate the invitation, write an audit
row, send email, then compensate selected failures with another update.

**Expected vs. actual:** An audit or email failure returns 500, but a failed
compensation write can leave a cancelled invitation, a rotated token, or an
audit entry inconsistent with what was delivered.

**Why left alone:** The scoped repository keeps current response and retry
semantics while constraining every invitation lookup and mutation to one
authorized organization.

**Suggested follow-up (not scheduled):** Commit invitation state and an email
outbox record transactionally, then deliver asynchronously with idempotent
retry and explicit delivery status.

### 2026-08-02 — Phase 2, custom fields — multi-value updates are not atomic

**What happened:** The custom-field values endpoint validates field names up
front but converts, writes, and triggers automation one field at a time. A
later invalid value or database failure can therefore follow earlier successful
writes. Automation failures are logged and the endpoint still returns the
saved values.

**Expected vs. actual:** A request containing several field changes appears to
be one logical save, but it can partially apply. Automation side effects can
also fail after the value is durable without changing the successful response.

**Why left alone:** The scoped repository preserves existing UI retry behavior
while constraining entity checks, definitions, values, and automation events to
the authorized organization. Atomic multi-field writes and durable side effects
require a transaction and outbox boundary.

**Suggested follow-up (not scheduled):** Validate and normalize the entire
request before writing, commit all value changes in one database function, and
enqueue automation events through a transactional outbox.

### 2026-08-02 — Phase 2, public invitations — acceptance finalization is best-effort

**What happened:** Invitation acceptance creates or activates the membership,
then marks the invitation accepted and writes an audit event as separate
operations. The established flow does not inspect failures from the final
invitation or audit writes.

**Expected vs. actual:** The endpoint can return success with an active member
while the invitation remains pending or its acceptance audit is absent. A retry
usually repairs the invitation status through the existing-member path, but the
original audit gap remains.

**Why left alone:** The token-scoped repository preserves existing acceptance
and retry semantics while constraining every membership, invitation, org, and
audit operation to the resolved invitation tenant.

**Suggested follow-up (not scheduled):** Accept the invitation, activate or
create membership, and insert the audit row in one transactional database
function with an idempotent invitation-state check.

### 2026-08-02 — Phase 2, onboarding session core — lookup and telemetry failures remain opaque

**What happened:** The established intake and profile flows treat a failed
session-ownership lookup as “Session not found,” and do not inspect failures
from the intake-duration analytics update.

**Expected vs. actual:** A database failure during ownership resolution can
surface as a 404 instead of a 500, while a successful intake response can omit
its timing telemetry. The owned session data itself is still written before the
best-effort analytics update.

**Why left alone:** The user-scoped onboarding repository preserves the current
status and retry behavior while ensuring every child read or write occurs only
after resolving the session ID together with the authenticated user ID.

**Suggested follow-up (not scheduled):** Return a typed not-found versus
infrastructure result from session resolution, and move session state plus
analytics updates into one transactional function or durable event boundary.

### 2026-08-03 — Phase 2, onboarding assistant — AI persistence remains best-effort

**What happened:** Chat and recommendation generation persist user messages,
AI-extracted profile data, session state, recommendation rows, and analytics as
separate operations. Several of those established writes do not inspect their
database result.

**Expected vs. actual:** An AI response can succeed while a message, state
transition, recommendation, or telemetry update is missing. Retrying may
recompute an answer or recommendation from partially persisted context.

**Why left alone:** The owned-session repository preserves current model and
retry behavior while ensuring the supplied session ID is resolved together
with the authenticated user before the assistant or any elevated child write
can run. Unowned chat sessions now return the same opaque 404 as other
onboarding session routes instead of revealing their existence with a 403.

**Suggested follow-up (not scheduled):** Persist each user turn before invoking
the model, then commit the assistant turn, extracted state, recommendation
transition, and an analytics/outbox event in an idempotent transaction.

### 2026-08-03 — Phase 2, onboarding provisioning — final linkage can strand a partial setup

**What happened:** Organization creation is transactional, but portfolio,
portfolio membership, modules, blueprint configuration, and onboarding-session
completion occur afterward. Most setup failures return a retryable 207, while a
failure updating the session's `organization_id` occurs after the organization
membership already exists.

**Expected vs. actual:** If that final session update fails, a retry can receive
“User already belongs to an organization” because the membership is durable but
the onboarding session was never linked to the organization that would make the
retry recognizable.

**Why left alone:** The user-scoped provisioner preserves the established
partial-result and cleanup behavior while ensuring the organization comes only
from the owner-safe provisioning function or the authenticated user's matching
session/membership pair. Fixing the recovery gap requires a durable idempotency
key or a broader transaction, not a route-boundary change.

**Suggested follow-up (not scheduled):** Make `session_id` the idempotency key
for a transactional provisioning function that creates or resumes the
organization, portfolio, owner memberships, configuration, and final session
linkage atomically.

### 2026-08-05 — Phase 2, AI chat — session messages use read-modify-write

**What happened:** `lib/api/repositories/ai-chat.ts:38-85` reads the session's
JSON message array, appends a user turn, and later replaces the array with the
assistant turn in separate writes.

**Expected vs. actual:** Sequential turns persist correctly. Concurrent turns
against the same active session can read the same starting array and overwrite
one another, losing a user or assistant message.

**Why left alone:** The scoped repository preserves the established session and
streaming behavior while binding every read and write to the authenticated user
and portfolio. Atomic append semantics require a database function or a
normalized message table, which belongs with the full AI-system refactor.

**Suggested follow-up (not scheduled):** Store turns in an `ai_messages` table
with one row per message, or append them through an idempotent transactional
database function keyed by session and turn ID.

**Resolution (Phase 3):** Implemented normalized `ai_turns` and `ai_messages`
rows plus transactional begin/complete/fail functions. Both chat transports now
use the same scoped repository and deterministic request-ID replay contract.

### 2026-08-05 — Phase 3, onboarding assistant — legacy org-type recommendation keys remain stale

**What happened:** Removing the onboarding assistant's file-wide TypeScript
suppression exposed that its recommendation defaults still use the legacy
`foundation`, `daf`, and `impact_investor` keys, while `QuickIntake.org_type`
uses the canonical organization-type union.

**Expected vs. actual:** Canonical foundation, DAF sponsor, family office,
community foundation, corporation, and individual values do not receive the
legacy default recommendation branches. The established model-driven
recommendation path still runs.

**Why left alone:** Phase 3 removes the type suppression without changing the
separate onboarding assistant's recommendation behavior. The mismatch is kept
behind a narrow string-compatibility boundary rather than a file-wide type
escape.

**Suggested follow-up (not scheduled):** Define and product-review a canonical
organization-type-to-module recommendation matrix, then update the prompt,
defaults, exclusions, and onboarding regression tests together.

### 2026-08-05 — Phase 4, holdings pilot — detail fields are absent from the canonical schema

**What happened:** The holdings detail read and its existing edit/photo actions
use `primary_contact_name`, `primary_contact_email`, `primary_contact_phone`,
`primary_contact_photo`, `primary_contact_notes`, and `theory_of_action` on
`holdings`. None of those columns exists in the canonical `db/migrations`
definition. A clean walkthrough database therefore rejects the detail query at
the first missing column, and contact/photo/theory mutations would also fail.

**Expected vs. actual:** The detail route is expected to render the seeded
holding and allow its contact and narrative fields to be edited. On the clean
schema it renders the established diagnostic panel with “column
holdings.primary_contact_name does not exist.” The grants list/detail journey
is unaffected.

**Why left alone:** The Phase 4 extraction preserved the existing select list,
forms, RLS-backed writes, and error panel exactly. Adding new canonical columns
or removing those product surfaces is a data-model and behavior decision, not a
thin-page boundary change. The prerelease schema can be aligned cleanly once
the intended ownership of contact and theory-of-action data is confirmed.

**Phase 5 decision:** Add `theory_of_action` to canonical `holdings`, but model
contacts in a first-class `holding_contacts` table rather than embedding six
single-contact columns. The table supports multiple contacts and roles, enforces
at most one primary contact per holding, and owns photo/notes data. The existing
single-contact UI will read and upsert the primary row through the holding
repository/view model. Update every read, write, photo upload, and AI/report
consumer together and protect the result with clean-reset and access contracts.

**Resolution (Phase 5):** Implemented the first-class contact model, private
contact-photo storage, parent-holding RLS, primary-contact adapter, and canonical
`theory_of_action`. Holding/charity consumers now traverse
`holdings.investee_id → investees.charity_id`; direct `holdings.charity_id` and
`holdings.nav` assumptions were removed.

### 2026-08-05 — Phase 5, schema alignment — active contracts diverged from the clean database

**What happened:** Active routes referenced missing KPI/donation views, missing
aggregate and risk RPCs, `generated_letters`, `admins`, `exec_sql`, and a
count-only last-owner helper. Donation reads also inferred a direct holding/tax
relationship, recommendation validators serialized arrays/JSONB as strings, and
Builder migration verification could leave generated database types stale.

**Expected vs. actual:** The application and Builder should compile and verify
against one prerelease schema canon. Instead, several features could type-check
through unparameterized clients while failing only at runtime on a clean
database. Unsafe or obsolete infrastructure was tempting to recreate as a
compatibility layer.

**Resolution (Phase 5):** Added generated database types and a post-reset drift
gate shared by normal and Builder verification. Added security-invoker KPI
series and donation summary views, repository-level KPI aggregation, an
authorized atomic risk-snapshot function, versioned `letter` documents, and an
authorized serialized portfolio-member mutation for last-owner safety. Profile
admin checks use `is_app_admin()`, demo seeding is a fixed typed adapter, and
recommendation validation now matches `text[]`/JSONB. No `admins`,
`generated_letters`, generic `exec_sql`, or count-only owner RPC was created.

**Extensibility boundary:** The generated `Database` type describes stable
platform canon only. Org-specific fields, KPIs, layouts, workflows,
automations, and module choices remain data in the sanctioned extension tables
and validated configuration. Import staging remains the only intentionally
schema-variable surface; client-specific DDL is not an extension mechanism.

**AI durability check:** The Phase 3 normalized `ai_turns`/`ai_messages`, unique
`(user_id, request_id)` claim, transactional begin/complete/fail functions,
deterministic replay, and completed-turn short circuit remain unchanged and are
covered by the Phase 5 schema contract. Schema alignment did not reintroduce a
session message JSON array or a second execution path around the durable turn
boundary.

**Additional compiler findings:** CRM screens actively consume donor anonymity,
organization contact, communication preference, and do-not-contact semantics,
so those stable product fields now live on canonical `donors`. ZIP,
contribution designation, and acknowledgment status remain response/view-model
aliases over `zip`, `fund_designation`, and `acknowledgment_sent`. Letter type is
canonical on `acknowledgment_letters` because routes, filters, PDFs, and AI tools
share its lifecycle; linked gifts remain the `contribution_ids` array and PDFs
remain private storage objects exposed through signed URLs.

### 2026-08-06 — Phase 5 review — behavioral gaps remained behind green source contracts

**What happened:** The first Phase 5 pass left a stale import-route assertion in
the full test suite. Review also found that donation tax-link filtering built an
unbounded ID list, donation summaries mixed scopes and assumed a 20% tax rate,
generated-letter version allocation raced, malformed latest letter content could
reset versioning, and holding/charity linking exposed broad elevated writes to a
global registry. Smaller findings covered typed-client documentation, import
adapter separation, raw membership errors, risk snapshot timestamps, browser
auth coverage, and stale tax documentation.

**Expected vs. actual:** The schema contract should enforce behavior under row
limits, concurrent writes, empty portfolios, soft deletion, and tenant access;
regex checks alone proved only that expected SQL fragments existed. Global
catalog changes should pass through a narrow capability rather than a service
client available to a member-triggered repository.

**Resolution (Phase 5 review):** Donation listing and summary semantics now live
in security-invoker views and are covered by post-reset transactional assertions.
Letter creation uses an authorized advisory-locked RPC; cache reads skip malformed
rows without influencing database version allocation. Charity linking accepts
only an existing canonical charity and uses an authorized, serialized RPC that
can materialize but cannot arbitrarily rewrite investee/catalog attributes. The
import adapter exposes distinct staging and target capabilities, internal member
errors no longer leak, risk upserts preserve `created_at`, browser-client
delegation is tested, tax documentation is current, and the stale suite assertion
was corrected.

**Contract clarification:** `PlatformDatabase` guarantees generated structural
names—relations, columns, views, RPCs, and argument keys. Value types, RPC return
values, and write-requiredness are deliberately relaxed because validated domain
boundaries own coercion. Tests and documentation now state that narrower promise.

### 2026-08-08 — Phase 6 — browser data access had no shared failure or transport boundary

**What happened:** Browser reads, mutations, uploads, downloads, and streams were
implemented across 175 client files with direct `fetch` calls. SWR consumers
also repeated local fetchers, generic hooks lived in two roots, and callers
handled response parsing and errors inconsistently. This made it easy for new AI
work to bypass a domain cache, save an API error as a downloaded file, or invent
browser-provided tenant authority.

**Resolution (Phase 6):** Added one response-preserving browser request primitive,
one JSON parser/error contract, named upload/download/stream helpers, and
domain-owned SWR hooks. All client components, contexts, and client pages now use
that boundary; root `hooks/` was consolidated under `lib/`; and a fail-closed
source contract rejects raw browser `fetch`, direct response JSON parsing, local
SWR fetchers, legacy hook imports, and authoritative organization headers.
Builder runs the same contract when proposals touch browser transport or domain
hooks, and the protected-path policy covers the shared transport foundations.

**Preserved boundaries:** No migration, database type, route, API response shape,
or server-side repository/access rule changed. Server-only upstream requests stay
outside the browser contract. AI chat continues to send stable request IDs through
the named stream helper, while the Phase 3 transactional turn/message persistence,
deterministic replay, and at-most-once side-effect boundary remain authoritative.

### 2026-08-08 — Phase 7 — stale code, templates, and SQL remained available to future agents

**What happened:** The repository had no reproducible dead-file/dependency gate,
78 superseded SQL files remained under `db/legacy`, and current module templates
still taught inline authentication, feature-local elevated clients, direct
browser data access, and monolithic AI executor patterns. Retired contexts,
dashboards, helpers, compatibility exports, and packages were still discoverable
even though no runtime, test, script, or framework entry point consumed them.

**Resolution (Phase 7):** Pinned Knip and depcheck now enforce objective dead
files, direct dependency drift, unresolved imports, and duplicate exports in CI;
narrow build/command-loader exceptions are documented. Removed 27 confirmed dead
source files, five unused direct packages, compatibility aliases/barrels, and all
78 legacy SQL files. Git history is the retired SQL archive, while a contract
prevents `db/legacy` from returning. Placeholder templates now have their own
source contract and demonstrate guarded org routes, tenant-scoped repositories,
shared browser transport/domain hooks, scoped AI capabilities, module checks,
and the schema decision protocol.

**Agent hardening:** `AGENTS.md` and `CLAUDE.md` share the same tested module
workflow. Both explicitly reject recreating `ModuleContext`/generic
`ModuleGate`, raw browser `fetch`, feature-local service clients, per-client DDL,
or elevated clients inside AI executors. They retain request-ID idempotency in
`ai_turns`, append-only `ai_messages`, persisted `ai_actions`, and atomic
begin/complete/fail turn semantics.

**Verification:** Hygiene, types, the 446-warning lint ratchet, 2,582 unit tests,
production build, all 54 canonical migrations (135 public tables), generated
database type drift, focused boundary contracts, and 9 browser smoke tests pass.
No active migration, generated database type, product URL, or intended behavior
changed.

### 2026-08-08 — Refactor closeout — server pages constructed elevated clients

**What happened:** Five server-rendered pages created service-role clients
directly. Four combined those clients with local access checks, but
`/settings/integrations` accepted the client-writeable `x-org-id` cookie as
tenant authority and used elevated access to read QuickBooks connection state
without proving that the current user belonged to that organization.

**Expected vs. actual:** Server pages should establish identity and organization
access through the shared access layer, then request data through a scoped
repository. An elevated client may be an implementation detail of a narrow
repository capability, but it must never be constructed by the page or returned
to it.

**Resolution:** All five pages now use explicit viewer or app-admin guards and
scoped repositories for organization dashboard, task, notification, QuickBooks,
and import-review data. Mapping profiles are additionally constrained to the
import job's organization. The API-boundary contract now scans every server
`page.tsx` and fails if a page constructs an admin client or references the
service-role credential. This closes consolidated backlog item SEC-01 and fixes
the integrations cross-tenant metadata disclosure.
