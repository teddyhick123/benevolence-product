# IT Admin — QA Findings

## 🔴 Critical (will crash or data loss)

### 1. Race condition on `total_records_extracted` counter during parallel CSV extraction
- **File:** `lib/import/csv-extractor.ts:87-97` · triggered by `lib/import/job-queue.ts:65`
- **What happens:** All entity CSVs are extracted in parallel via `Promise.allSettled`. Each extractor does a read-then-write on `import_jobs.total_records_extracted`: read current value → add rows → write back. Two parallel extractions racing on the same job will both read `0`, both add their row count, and the second write stomps the first. Final counter underreports actual extracted rows.
- **Reproduction:** Upload a job with both `constituents.csv` (500 rows) and `gifts.csv` (500 rows). Both extractors race; final counter shows 500 instead of 1000.
- **Fix:** Use a `Postgres` `UPDATE … SET total_records_extracted = total_records_extracted + $1` atomic increment rather than a read-then-write pattern.

---

### 2. Watchdog POST endpoint has no authentication
- **File:** `app/api/admin/imports/watchdog/route.ts:7`
- **What happens:** `POST /api/admin/imports/watchdog` calls `mark_stale_import_jobs()` (which marks *currently running* jobs as `failed`) with no admin check. Any unauthenticated HTTP client can hit this endpoint and terminate live import jobs.
- **Reproduction:** `curl -X POST https://[host]/api/admin/imports/watchdog` — marks all running jobs older than 30 minutes as failed.
- **Fix:** Add the `requireAdmin()` check used in every other import route before calling the RPC.

---

### 3. SSE progress emitter breaks in any multi-process or serverless deployment
- **File:** `lib/import/progress-emitter.ts:16`
- **What happens:** `ImportProgressEmitter.clients` is a static in-process `Map`. The BullMQ worker (process A) calls `ImportProgressEmitter.emit()`, but the subscribed SSE client is connected to a different Next.js server replica (process B). The Map on process B has no subscribers for this job ID, so zero progress events are delivered. The UI silently falls back to 5-second polling and shows no per-entity progress bars.
- **Reproduction:** Deploy with `pm2 -i 2` (2 workers) or on any serverless/edge runtime and start an import.
- **Fix:** Replace the in-process Map with a pub/sub channel (Redis pub/sub is already available via the BullMQ Redis connection). The SSE route subscribes to `import:progress:{jobId}` and the worker publishes there.

---

### 4. Reconciliation source amount total silently truncated at 1,000 rows (Supabase default)
- **File:** `lib/import/reconciler.ts:200-208`
- **What happens:** The contributions reconciler fetches all staging rows to sum `amount_usd` with no `.limit()` and no pagination. Supabase/PostgREST returns at most 1,000 rows by default. An import with 10,000 contributions silently uses only the first 1,000 rows to compute `sourceTotalAmount`. The delta check fires false positives, locking the import in `paused` state and preventing commit.
- **Reproduction:** Import 5,000 contributions averaging $1,000 each. `sourceTotalAmount` = ~$1,000,000 (1K rows) vs `loadedTotalAmount` = ~$5,000,000. Delta = 400%. Reconciliation blocks commit even though all rows loaded correctly.
- **Fix:** Add `.limit(null)` (or paginate in batches) when summing contribution amounts, or push the aggregation into a DB function/RPC.

---

### 5. PDF generation crashes with `NaN` coordinates when entity counts are all zero
- **File:** `lib/pdf/migration-report-generator.ts:175`
- **What happens:** `y = (doc as any).lastAutoTable.finalY + 10` — when `entityCounts` is empty the `autoTable` call renders a header-only table and `lastAutoTable.finalY` may be `undefined`. All subsequent `doc.text()` and `doc.rect()` calls receive `NaN` y-coordinates. jsPDF silently ignores NaN draws, producing a PDF that is blank from the entity table section onward (cover page renders, everything below is missing).
- **Reproduction:** Call `generateMigrationReportPDF` with `entityCounts: {}`.
- **Fix:** Guard with `y = (doc as any).lastAutoTable?.finalY ?? y + 10` and add a fallback row (`[['No data', '-', '-', '-', '-']]`) when `entityCounts` is empty.

---

## 🟡 High (bad UX, confusing, likely to cause support requests)

### 6. "Start Import" button has no disabled state — double-submit creates duplicate jobs
- **File:** `components/admin/NewImportWizard.tsx:273-280`
- **What happens:** The Step 2 "Start Import" button has no `disabled={loading}` attribute. React state updates are async; clicking twice before the first re-render queues two `handleStartImport` calls, submitting two identical `POST /api/admin/imports` requests. The server creates two import jobs with the same name, same files, and both start processing.
- **Reproduction:** Click "Start Import" twice in rapid succession. Two jobs appear in the import dashboard.
- **Fix:** Add `disabled={loading}` to the Step 2 button.

---

### 7. UTF-8 BOM causes silent field mapping failure for the first column
- **File:** `lib/import/csv-extractor.ts:46`
- **What happens:** `fileData.text()` returns the raw file contents without stripping the BOM (`\uFEFF`). CSV files exported from Windows Excel or Blackbaud RE NXT routinely include a UTF-8 BOM. PapaParse in header mode (`header: true`) uses the raw column name as the key, so the first column header becomes `"\uFEFFColumnName"`. The field mapping profile references `"ColumnName"` (no BOM), so the entire first column is silently null for every row. No validation error fires.
- **Reproduction:** Export any CSV from Excel on Windows. First column data is always null after import.
- **Fix:** Strip the BOM before parsing: `const csvText = (await fileData.text()).replace(/^\uFEFF/, '');`

---

### 8. AI `callAI` has no timeout — hangs forever if Anthropic API is unresponsive
- **File:** `lib/import/ai/client.ts:21-27`
- **What happens:** `anthropic.messages.create()` has no `AbortSignal` or timeout. If the Anthropic API returns a 503 or stalls (common during model overload), the request hangs until the Next.js API route times out (~30-60s on Vercel). During this time the user sees a spinner with no feedback.  The mapping-assist route, the reconciliation AI route, and the validate-row route are all affected.
- **Reproduction:** Set `ANTHROPIC_API_KEY` to a valid key and throttle the `api.anthropic.com` host at the network level. Request to `/api/admin/imports/mapping-assist` hangs 30+ seconds then returns a 504.
- **Fix:** Wrap with `AbortSignal.timeout(15_000)` and surface a user-friendly error: `"AI mapping is temporarily unavailable. You can map fields manually."` The import must remain fully functional without AI.

---

### 9. `bulk-fix` loops 5,000 individual row updates — will timeout on large imports, silently misses rows beyond 5,000
- **File:** `app/api/admin/imports/[id]/bulk-fix/route.ts:111-156`
- **What happens:** Fetches up to 5,000 staging rows then calls `.update()` per row in a sequential `for` loop. With even 1,000 rows, the loop takes ~3-5 seconds. At 5,000 rows it approaches the API timeout. Imports with more than 5,000 invalid rows silently receive an incomplete fix (no error is returned — the response shows `{ fixed: 5000 }` suggesting all rows were handled).
- **Reproduction:** Import 6,000 rows with EIN format errors. Apply bulk EIN fix. Response says `fixed: 5000` but 1,000 rows still have errors.
- **Fix:** Use a single `UPDATE … SET transformed_data = … WHERE id = ANY(array_of_ids)` or a DB function to apply the fix in bulk. At minimum, loop in pages and surface a `truncated: true` flag in the response.

---

### 10. `loader.ts` uses OFFSET-based pagination — O(N²) scan on large imports
- **File:** `lib/import/loader.ts:133-139`
- **What happens:** `loadPhase` uses `.range(offset, offset + batchSize - 1)` (OFFSET pagination). PostgreSQL must scan and discard all preceding rows to return each batch. For a 10,000-row import with batch size 500, the 20th batch requires a full-table scan of 10,000 rows. Total work is O(N²). The ETL runner correctly uses keyset pagination; the loader does not.
- **Reproduction:** Import 10,000 holdings. Loading phase starts fast then progressively slows. The last batches each take 5-10× longer than the first. At scale, the loading phase will timeout.
- **Fix:** Follow the keyset pagination pattern from `etl-runner.ts`: track `lastId` and use `.gt('id', lastId)` instead of `.range()`.

---

### 11. ETL runner progress percent can exceed 100% (wrong divisor across entity types)
- **File:** `lib/import/etl-runner.ts:163-167`
- **What happens:** `result.processed` is a cumulative counter across ALL entity types processed so far, but `totalRows` is reset per entity type. When processing entity type 2, `result.processed` might be 2,500 (1,500 from type 1 + 1,000 from type 2) while `totalRows` is 1,000 (rows in type 2 only). The emitted `percent` is 250%. The progress bar in `ImportProgressMonitor` clamps to 100% via CSS width but the raw value is wrong, corrupting ETA calculations.
- **Reproduction:** Import a job with both `constituents.csv` (1,500 rows) and `metrics.csv` (500 rows). The metrics progress bar briefly shows >100%.
- **Fix:** Calculate `percent` using an entity-local processed counter, not `result.processed`.

---

### 12. SSE progress endpoint has no authentication
- **File:** `app/api/admin/imports/[id]/progress/route.ts:9-24`
- **What happens:** `GET /api/admin/imports/:id/progress` has no `requireAdmin()` check. Any unauthenticated HTTP client knowing an import job UUID can subscribe to the live SSE stream and receive all progress events, including entity names, row counts, and timing.
- **Reproduction:** Open `/api/admin/imports/[any-uuid]/progress` in a browser tab without logging in.
- **Fix:** Add the `requireAdmin()` check at the top of the GET handler before calling `ImportProgressEmitter.subscribe()`.

---

### 13. Full rollback silently fails to reset staging for contributions and users (wrong column name)
- **File:** `lib/import/rollback.ts:153-157`
- **What happens:** The full rollback loop sets `{ action_taken: 'pending', final_id: null }` on every staging table. `staging_import_contributions` has no `final_id` column (it has `final_tax_contribution_id` / `final_holding_contribution_id`). `staging_import_users` has no `final_id` column (it has `final_profile_id`). Both PostgREST updates return errors that are silently swallowed (no `const { error }` check). The subsequent explicit cleanup calls on lines 160-168 do correctly reset these tables, so the end state is correct — but the two silent DB errors obscure any real errors and make the rollback fragile if the explicit cleanups are ever moved.
- **Reproduction:** Perform a full rollback on an import that loaded contributions and users. Check server logs — two PostgREST 400 errors appear but no rollback failure is surfaced.
- **Fix:** Remove contributions and users from the generic loop and handle them only via the explicit cleanup blocks. Or check for `error` after each `.update()` in the loop.

---

### 14. "Auto-fix" button in `ReconciliationReport` component has no `onClick` handler — does nothing
- **File:** `components/admin/ReconciliationReport.tsx:148-150`
- **What happens:** When AI analysis finds auto-fixable issues, the button renders as:
  ```jsx
  <button className="text-sm text-azure hover:underline">
    Auto-fix {autoFixableCount} issue(s)
  </button>
  ```
  There is no `onClick`. Clicking it does nothing. The admin believes fixes are being applied but nothing happens.
- **Reproduction:** Trigger reconciliation on a job with amount mismatches. AI analysis flags auto-fixable issues. Click "Auto-fix" — no change.
- **Fix:** Wire the button to call the bulk-fix API for each auto-fixable issue, or at minimum navigate to the errors table with a filter applied.

---

### 15. Bulk fix "auto-fixable" count in error table only reflects current page
- **File:** `components/admin/ImportErrorsTable.tsx:203-205`
- **What happens:** `autoFixableCount` is computed by scanning `rows` (the current 50-row page). If there are 5,000 rows with EIN errors spread across 100 pages, page 1 shows "Apply 50 auto-fixable fixes" — but clicking it correctly applies the fix to all 5,000 rows (the API handles this properly). The button label is misleading and causes confusion when the count changes unexpectedly after the fix runs.
- **Reproduction:** Import 500 rows with EIN errors. Navigate to any error page — all pages show the same undercount.
- **Fix:** Fetch the total auto-fixable count from the API (errors endpoint could return it as a metadata field) rather than counting from the current page.

---

## 🟢 Low (polish, minor improvements)

### 16. `handlePause` and `handleResume` have no error handling or loading state
- **File:** `components/admin/ImportProgressMonitor.tsx:125-141`
- **What happens:** Both functions call `fetch()` with no `try/catch`. A network error or 500 response silently discards the failure. The user clicks Pause, nothing changes, and there is no feedback explaining why.
- **Fix:** Add `try/catch` and show a brief error toast on failure. Also disable the buttons while the request is in-flight.

---

### 17. PDF action items can render beyond page boundary
- **File:** `lib/pdf/migration-report-generator.ts:212-222`
- **What happens:** Each action item increments `y` by 13pt with no page-overflow check. More than ~12 action items (depending on preceding content height) will render text beyond the bottom of the page, clipping silently without starting a new page.
- **Fix:** Check `if (y + 13 > doc.internal.pageSize.height - 15) { doc.addPage(); y = 20; }` before drawing each action item.

---

### 18. `callAI` has no retry for transient Anthropic errors (429, 529)
- **File:** `lib/import/ai/client.ts:21-27`
- **What happens:** A single rate-limit (429) or model-overloaded (529) response from the Anthropic API throws immediately and surfaces a raw API error to the user. No retry is attempted. The Anthropic SDK supports `maxRetries` in the constructor options.
- **Fix:** Set `new Anthropic({ apiKey: ..., maxRetries: 2 })` to handle transient errors automatically, or catch 429/529 specifically and surface a friendly message.

---

### 19. CSV parse errors are logged but don't surface in the errors UI
- **File:** `lib/import/csv-extractor.ts:55-59`
- **What happens:** PapaParse errors (malformed rows, wrong column counts) are pushed to an `errors` array and returned in the `ExtractResult`, but the job-queue worker at `job-queue.ts:83` logs them to console and continues. They are never written to the import audit log or surfaced in the validation errors UI. An admin importing a corrupted CSV sees no indication of the parse problem.
- **Fix:** Write parse errors to the staging table as rows with `validation_status: 'invalid'` and a descriptive `validation_errors` entry, or at minimum write them to `import_jobs.notes` so they appear in the job details.

---

### 20. Mixed/legacy character encodings produce silent data corruption
- **File:** `lib/import/csv-extractor.ts:46`
- **What happens:** `fileData.text()` decodes as UTF-8. CSV exports from older Blackbaud RE versions or DonorPerfect often use Windows-1252/Latin-1. Characters like `é`, `ñ`, `ü` (common in donor names) are decoded as multi-byte UTF-8 sequences and stored as garbled strings. No warning is shown.
- **Fix:** Accept an optional `encoding` parameter, or use `TextDecoder` with charset detection (e.g., check for a `charset` hint in the file name or let the user declare it in the wizard step 1).

---

### 21. Amount delta action item fires on any non-zero delta, including $0.01 float rounding
- **File:** `lib/import/reconciler.ts:56-60`
- **What happens:** `if (entity.amountDelta && entity.amountDelta > 0)` — even a $0.01 floating-point rounding difference from IEEE 754 arithmetic triggers an action item: `"contributions: amount delta of $0.01 detected (0.00% variance)"`. This creates noise in every reconciliation report.
- **Fix:** Gate the action item on `entity.amountDeltaPercent > tolerancePercent` to match the existing tolerance logic used for `withinTolerance`.

---

### 22. `validator.ts` `positive` rule silently skips string values that haven't been coerced
- **File:** `lib/import/validator.ts:103-104`
- **What happens:** `evalPositive` returns `null` (no error) when `typeof value !== 'number'`. If a row bypasses the transformer (e.g., `transformed_data` is populated by the bulk-fix path or manually patched), a string `"0"` or `"-5"` would pass the positive check undetected.
- **Fix:** Also check `typeof value === 'string'` and coerce with `parseFloat()` before the numeric comparison, or document that this rule only applies post-transformation.

---

## Summary

- **5 critical**, **10 high**, **7 low** issues found
- **Overall assessment:** The import pipeline's core logic (extraction, transform/validate, load, rollback) is architecturally sound, but several production-readiness gaps exist: the in-process SSE emitter is a fundamental deployment blocker, the reconciliation source total silently truncates at 1,000 rows (creating false reconciliation failures on any real-world import), and the watchdog endpoint is unauthenticated. These three issues should be resolved before going live with a real client migration.
