# Admin / Import System — Module Review

**Reviewed:** 2026-04-26
**Reviewer:** Senior Product Engineer (Claude Sonnet 4.6)
**Codebase revision:** commit b8d0c391

---

## Import Pipeline Quality

### What was read
`lib/import/csv-extractor.ts`, `lib/import/transformer.ts`, `lib/import/etl-runner.ts`, `lib/import/validator.ts`, `lib/import/ai/mapping-assist.ts`, `lib/import/ai/prompts/mapping-assist.ts`, `app/api/admin/imports/route.ts`, `components/admin/NewImportWizard.tsx`

### File formats supported
Only **CSV** files are processed through the main import pipeline (`csv-extractor.ts`). The older `/admin/upload` page (for KPI fact ingestion) accepts `.csv`, `.xlsx`, `.xls`, and `.pdf` via a separate `parseDocument` + OpenAI path (`app/api/admin/upload/ingest/route.ts`). These are two entirely separate pipelines with no shared code, and the distinction is not explained anywhere in the UI.

### AI mapping quality
The mapping assist system is solid in design. The system prompt in `lib/import/ai/prompts/mapping-assist.ts` (lines 4–53) teaches the model the Benevolence target schema for all five entity types, requests strict JSON output, and includes confidence, reason, and sample_transforms per field. Auto-population triggers on page load for all entities (`MappingPageClient.tsx` lines 70–77) with a "high confidence ≥ 0.85" toast.

However, the mapping assist call in `MappingPageClient.tsx` line 93 sends `sample_records: []` — an empty array every time. The prompt template in `mapping-assist.ts` line 67 shows sample records are included in the prompt, but no actual row data is being passed. This means the AI is mapping purely from field names, not from the values in the CSV, which degrades accuracy for fields with ambiguous names.

### Transformer robustness
`transformer.ts` handles numeric coercion (strips `$` and `,`), six flexible date formats (`date-parser.ts`), boolean normalization (`yes/true/1`), and enum mapping with a case-insensitive values_map fallback. EIN normalization strips non-digits and re-formats as `XX-XXXXXXX`. These are all well-implemented.

Gap: the transformer's `applyFieldMapping` (line 77) only maps fields that exist in `field_map`. Fields present in the raw CSV that are not mapped are silently dropped. There is no "unmapped passthrough" mode and no warning that source data was discarded.

### Error handling on bad data
PapaParse errors accumulate in an `errors[]` array (line 56–59 of `csv-extractor.ts`) but processing continues regardless of parse error count. A file that is 20% malformed CSV will still attempt to insert the parsed portion. The errors are stored in the `ExtractResult.errors` array but only logged at the worker level — they never surface in the import detail UI.

The 50MB size cap is enforced correctly (`csv-extractor.ts` line 39–44). Batch insert failures are logged per-batch but do not abort the extraction, which is correct for resilience but means `rowsInserted` can be less than `totalRows` without an obvious alert to the operator.

### Source system coverage
`ImportJob.source_type` declares `'blackbaud_api' | 'csv_export' | 'direct_db'` but the worker (`job-queue.ts`) only implements `csv_export`. `blackbaud_api` and `direct_db` are never called. The mapping profile type `blackbaud_re_nxt` exists and the AI prompt references Blackbaud RE NXT field names, but all client data must arrive as CSV exports — a real Blackbaud API connection is absent.

---

## Reliability & Error Handling

### Job state machine
States: `pending → running → paused → completed | failed | rolled_back`. The BullMQ worker (`job-queue.ts`) marks the job `paused` after extract + validate (line 103–106) so a human can review before commit. This is the correct design for a migration tool.

The heartbeat at 30-second intervals (`job-queue.ts` lines 49–54) is gated with `.eq('status', 'running')` so it won't erroneously update stale jobs. The stale-job watchdog (`stale-job-watchdog.ts`) calls a `mark_stale_import_jobs()` DB function every 60 seconds. Both mechanisms are sound.

### Rollback
The rollback implementation (`lib/import/rollback.ts`) is genuinely strong:
- Reads `import_audit_log` in reverse chronological order
- Bulk-deletes inserted records by ID (in 500-row chunks)
- Upserts pre-image snapshots for updated records
- Supports both full and per-phase (`LoadPhase`) partial rollback
- Resets staging row `action_taken` so the phase can be re-loaded
- Hard cap of 5,000 audit log rows per rollback (line 83) — **this will silently leave data behind for large imports**. A 10K-row import touching two tables can exceed this limit.

### Audit trail
`ImportAuditor` buffers up to 100 entries, flushes on threshold or every 5 seconds (`auditor.ts` lines 26–38). Before/after snapshots are written for every insert and update. This is the backbone of rollback and is well-designed. One gap: the auditor's `flush()` is fire-and-forget at the buffer level — if the server process dies between buffer fill and scheduled flush, those entries are lost. The 5-second auto-flush interval mitigates this but does not eliminate it.

### Progress tracking
`ImportProgressEmitter` uses an in-process `Map` of SSE controllers (`progress-emitter.ts`). This works correctly on a single server instance but will not propagate events across multiple Next.js instances (e.g., Vercel edge replicas or multiple BullMQ workers). In a multi-instance deployment, the operator would see no real-time events even though the job is running.

### Load phase robustness
`loader.ts` processes rows individually inside `processRow`. Each row's failure is caught and marked `error` without aborting the batch. This is correct. The `records_loaded` counter is incremented at the batch level via a read-then-write pattern (lines 186–196), not atomically — in theory two concurrent workers could both read the same value and double-count. In practice concurrency is limited to 2 (line 129 of `job-queue.ts`) and jobs are scoped per `importJobId`, so this is unlikely to bite.

### Commit endpoint gap
`app/api/admin/imports/[id]/commit/route.ts` marks the job `completed` but does **not** trigger loading. The load is triggered separately via `POST /api/admin/imports/:id/load`. The Copilot's "commit" action (type `'commit'` in `chat.ts` line 29) calls the commit endpoint, not the load endpoint. This means a user who clicks "Commit" from the Copilot chat will mark the job complete without actually loading data to production tables if the load was not already done. This is a silent data-loss risk.

---

## UX for Benevolence Staff

### Import wizard
The `NewImportWizard` (3 steps: source setup → mapping → confirm) is clean and intuitive. File slots are labeled "Constituents / Donors", "Funds / Holdings", "Gifts / Contributions", and "Custom Fields (optional)" — this matches Blackbaud's mental model well.

Step 2 says "Using default mapping profile — you can customize after creation" but does not indicate whether a default profile actually exists in the database. If no default `blackbaud_re_nxt` mapping profile is seeded, the ETL runner will silently skip transform+validate (`job-queue.ts` lines 86–98: `if (profile)` guard). The operator will see 0 validated rows with no error message.

### Mapping grid
`MappingGrid.tsx` is the strongest UX piece in the module. AI confidence badges, expandable reasoning rows (`aiSug.reason` display), required field indicators, and an unmapped-required warning banner all work together. The "AI analyzed N fields, M mapped with high confidence" banner is well-placed. The one gap is that the grid initializes with `assignments` from `initialAssignments` on mount and never re-initializes if AI suggestions arrive after the component renders — but because AI is fetched in a `useEffect` on load, this is unlikely to cause issues in practice.

### Error browser
`ImportErrorsTable` is functional and provides entity tabs, severity filters, per-row raw value display, and bulk auto-fix. The "Apply N auto-fixable fixes" button is a genuine time-saver. The AI "Apply Fix" button per row fires `fetchAIFix` which calls `/api/admin/import/ai/suggest` — this shows a `proposed_value` with confidence but does not apply the fix in one click; the operator still must do something with the suggestion. The workflow for accepting a suggestion is unclear — there's no "Accept" button next to the proposal.

### Copilot
`ImportCopilot.tsx` is polished: streaming text, starter prompts, minimizable to a floating button, and action buttons that map to real API calls (`bulk_fix`, `rollback`, `commit`, `skip_warnings`). The action button system is the best non-engineer affordance in the module. Copilot chat history is session-only (confirmed in `AI_IMPORTER_BLUEPRINT.md` line 357) — a staff member who refreshes the page loses context mid-import.

### Upload page (KPI ingestion)
`app/admin/upload/page.tsx` is a simpler "end-of-year report" path for KPI fact upload. The "Approve All" button in the staged facts review (`line 159–162`) fires sequential per-fact approve calls in a `for` loop with `await` — for a large extraction this will block the UI and time out. No batch-approve API endpoint exists.

### Missing affordances for non-engineers
- No indication of which CSV columns are expected before upload
- No download template / sample CSV link
- Resume button on the import dashboard (line 91 of `ImportDashboardClient.tsx`) has no `onClick` handler — it is visually present but inert
- Rollback button on the dashboard (line 95–96) also has no `onClick` handler — same issue

---

## Blackbaud Data Model Coverage

The five import entity types and their production targets are:

| Import entity | Production table(s) | Blackbaud equivalent |
|---|---|---|
| `investees` | `investees` | Constituents (organizations) |
| `holdings` | `holdings` | Funds / campaign records |
| `users` | `profiles`, `portfolio_members` | Staff / users |
| `contributions` | `tax_contributions`, `holding_contributions` | Gifts |
| `metrics` | `metric_facts` | Custom fields / analytics |

### What is covered
Cash/check/wire/stock/crypto/real_estate gift types are in the validator (`validator.ts` lines 67–75). EIN normalization handles Blackbaud's inconsistent EIN formatting. Deductible amount is auto-derived from `amount_usd - quid_pro_quo_value` (transformer.ts line 185–191). Tax year is auto-derived from contribution date.

### What is missing
The following Blackbaud RE NXT data types have **no corresponding entity, staging table, or field map**:

- **Campaigns** — Blackbaud's campaign hierarchy (Campaign > Appeal > Fund) maps to holdings in spirit, but appeals are not imported as a separate dimension
- **Appeals** — no entity; source field `appeal_code` would be silently dropped
- **Soft credits** — Blackbaud tracks split/soft credit relationships between gifts and constituents; there is no soft credit entity or field in `tax_contributions`
- **Pledges** — installment pledge schedules are not modeled; pledge records import as single contributions if they exist
- **Event registrations** — no entity; event participants are not imported
- **Relationships** — Blackbaud's constituent relationship pairs (spouse, employer, board member) are not modeled
- **Notes / interactions** — contact reports and notes are not imported
- **Tribute gifts** — `in_honor_of` / `in_memory_of` fields are not in the target schema
- **Recurring gifts** — subscription schedule is not modeled

The mapping-assist AI system prompt mentions only five entity types with no mention of appeals, pledges, or soft credits. A Blackbaud migration for a medium-complexity foundation will have all of these.

---

## Admin CRUD Completeness

### Organization management (`/admin/org/`)
The org settings page (`app/admin/org/[orgId]/page.tsx`) covers five tabs: overview (name, EIN, org_type, fiscal_year_end, state_of_incorporation), members, portfolios, modules, and branding. This is complete for MVP purposes.

Gap: adding a member requires knowing the user's UUID (`line 298` — "UUID of user" input field). Non-engineers will not know user UUIDs. The `EmailLookupAdd` component exists in `components/admin/` and is presumably built for this, but it is not wired into the org settings page — only the UUID raw input is present.

### Portfolio management (`/admin/console/`)
The admin console lists portfolios with member counts, provides links to dashboard/members/settings. `app/admin/portfolios/new/page.tsx` handles creation. `app/admin/portfolios/[id]/settings/route.ts`, `members/route.ts`, and `kpis/route.ts` exist.

Gap: the console has no way to delete a portfolio or organization. There is also no ability to transfer ownership, export portfolio data, or archive a client.

### KPI management (`/admin/portfolios/[id]/kpis/`)
The KPI management page exists but was not fully read. The import system seeds `metric_facts` but never creates `kpi_definitions` — KPI targets and display names must be configured separately.

### Builder proposals (`/admin/builder/`)
`BuilderProposalsClient.tsx` implements approve/reject/mark-applied for AI-generated config change proposals. The "Mark as applied" action updates status to `applied` but does not actually execute the code change — it is a workflow status flag only. An engineer must still manually apply the diff shown. This is the correct conservative approach for now but should be documented prominently in the UI.

---

## Security & Audit

### Admin gate consistency
There are two different admin check patterns in use across the codebase:

1. **Pattern A** — direct `admins` table lookup (used in `imports/route.ts`, `imports/[id]/commit/route.ts`, `imports/[id]/load/route.ts`, `imports/[id]/rollback/route.ts`):
   ```ts
   const { data: adminRow } = await supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
   ```

2. **Pattern B** — `is_admin` RPC function (used in `imports/[id]/ai/chat/route.ts`, `imports/[id]/bulk-fix/route.ts`, `imports/page.tsx`):
   ```ts
   const { data: isAdmin } = await supabase.rpc('is_admin');
   ```

3. **Pattern C** — `is_super_admin` profile flag (used in `builder/page.tsx`):
   ```ts
   if (!profile?.is_super_admin) redirect('/dashboard');
   ```

These three patterns may or may not check the same underlying condition depending on how `is_admin` is implemented in SQL vs. the `admins` table. If they diverge, a user could be blocked at one endpoint and pass at another. This should be unified into a single `requireAdmin()` helper used everywhere.

### Tenant isolation during import
Import jobs reference `portfolio_id` but the routes use `createAdminClient()` (which bypasses RLS) for all DB operations during the import pipeline. This is necessary for the bulk staging inserts but means there is no row-level isolation check enforcing that the job's `portfolio_id` belongs to the requesting admin's authorized tenant scope. A malicious admin could in theory trigger a load phase for a job belonging to a different tenant's portfolio if they know the job UUID.

### AI chat rate limiting
The chat endpoint (`imports/[id]/ai/chat/route.ts` lines 57–62) correctly applies `aiLimiter` per user before streaming. This is the only import API endpoint with rate limiting applied.

### Audit trail completeness
Every row-level production table change (insert, update) is written to `import_audit_log` with before/after snapshots via `ImportAuditor`. Rollback operations are themselves logged. This is genuinely strong for a migration tool.

Gap: the `commit` endpoint does not log to the audit trail — only the status update fires, without any audit log entry for "import finalized by user X at timestamp Y." For compliance purposes this should be recorded.

### Data stored in staging tables
`staging_import_*` tables hold the full raw CSV content as JSONB in `raw_data`. For foundations with donor PII (names, addresses, email), this means sensitive data sits in staging tables indefinitely post-import. There is no TTL, cleanup job, or documented data retention policy for staging data.

---

## Overall Rating

**6.5 / 10**

The import pipeline's core ETL architecture is genuinely well-designed: keyset pagination, buffered audit logging, per-phase rollback, BullMQ orchestration, and an AI copilot with real action affordances are all above-average for a 20-day sprint. The mapping grid with AI confidence display and the error browser with bulk-fix are strong UX wins for non-engineer staff.

The rating is held back by several compounding gaps: the "commit" action does not load data; the dashboard rollback and resume buttons are inert; sample records are never sent to the AI for mapping suggestions; Blackbaud's campaign/appeal/pledge/soft-credit model is entirely absent; the 5,000-row audit log cap can silently leave production data behind on rollback; and the two-system import architecture (main ETL pipeline vs. KPI upload) is undocumented and potentially confusing for staff.

---

## Priority Fixes (Top 5)

**1. Wire the "Commit" Copilot action to the load endpoint, not the status endpoint**
File: `lib/import/ai/chat.ts` line 29, `components/admin/ImportCopilot.tsx` `handleAction` case `'commit'` (line 197–200)
The current `commit` action calls `POST /api/admin/imports/:id/commit` which only marks the job `completed` without loading any data. Either rename it to `'finalize'` and route it after load, or make the commit endpoint call `loadStagingToProduction` internally. This is the highest-severity bug — it allows marking an import "complete" with no data in production.

**2. Fix the inert Resume and Rollback buttons on the import dashboard**
File: `app/admin/imports/ImportDashboardClient.tsx` lines 89–96
Both buttons render with no `onClick` handler. Add handlers that `POST` to `/api/admin/imports/:id/rollback` (for rollback) and call the appropriate resume/load endpoint. A staff member who needs to roll back from the dashboard list view currently has no path to do so without entering the detail page.

**3. Pass actual sample records to the AI mapping assistant**
File: `app/admin/imports/[id]/mapping/MappingPageClient.tsx` line 93 (`sample_records: []`)
The `stagingPreviews` array contains `sourceFields` but not sample values. Extend the staging preview to include up to 5 sample raw rows per entity, then pass them to the mapping assist API. Without real values the AI cannot distinguish `date` from `text` fields that share similar names, or detect numeric columns stored as strings with currency symbols. This will materially improve the mapping suggestion acceptance rate.

**4. Raise or paginate the 5,000-row rollback audit log cap**
File: `lib/import/rollback.ts` line 83 (`.limit(5000)`)
For a 10K-row Blackbaud export touching contributions and investees, the audit log can easily exceed 5,000 entries. Remove the hard limit and replace with a paginated loop (process 5,000 at a time with a cursor) that runs until exhausted. Add a count check before rollback that warns the operator if the import has > 5,000 audit entries, so they understand rollback will take multiple passes.

**5. Unify the three admin authorization patterns**
Files: `app/api/admin/imports/route.ts` (Pattern A), `app/api/admin/imports/[id]/ai/chat/route.ts` (Pattern B), `app/admin/builder/page.tsx` (Pattern C)
Audit all 25+ admin API routes and confirm which `requireAdmin()` variant they use. If the `is_admin` RPC and the `admins` table lookup return different results for any user, access control is inconsistent. Standardize on the RPC pattern (it is more flexible and respects future RBAC changes), replace all Pattern A `admins` table lookups, and document the distinction between `is_admin` and `is_super_admin` so it is clear which endpoints require which level.
