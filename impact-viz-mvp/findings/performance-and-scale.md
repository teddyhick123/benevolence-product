# Performance & Scale Audit — QA Findings

## 🔴 Critical (will crash or time out under load)

### 1. Bubble Chart API: O(N×4) sequential DB queries per holding
- **File:** `app/api/portfolio/[id]/bubble-chart/route.ts:45–84`
- **What happens:** For every holding in the portfolio, 3–4 individual sequential `SELECT … LIMIT 1` queries are issued (one per metric code: xMetric, yMetric, sizeMetric, colorMetric). With 50 holdings and 4 metrics this is 200 round-trips; with 200 holdings it becomes 800. Each query goes to Supabase independently with network + parse overhead.
- **Reproduction:** Add 100+ holdings to a portfolio, configure a bubble chart widget with 3 metrics. The `/api/portfolio/[id]/bubble-chart` request will take tens of seconds or hit the 30 s serverless function timeout.
- **Fix:** Replace the per-row loop with two batched queries:
  1. `SELECT holding_id, metric_code, value FROM metric_facts WHERE holding_id IN (...all holding IDs) AND metric_code IN (xMetric, yMetric, sizeMetric, colorMetric) AND period_end = (SELECT MAX(period_end)...)`.
  2. Group results in JS into a `Map<holdingId, Map<metricCode, value>>` before building `bubbleData`.

---

### 2. Heat-map API (metrics mode): O(N×M) individual DB queries per request
- **File:** `app/api/portfolio/[id]/heat-map/route.ts:158–177`
- **What happens:** Identical anti-pattern to bubble-chart. A doubly-nested `for … for` loop fires one `SELECT … LIMIT 1` per `(holding, metricCode)` pair. 50 holdings × 10 metrics = 500 sequential DB round-trips.
- **Reproduction:** Configure a heat-map widget in metrics mode with 10 metrics on a portfolio with 50+ holdings.
- **Fix:** Same as Issue 1 — batch with `holding_id IN (...)` and `metric_code IN (...)`, then pivot the result set in memory.

---

### 3. Import loader: per-row sequential DB queries (N×5–8 queries/row)
- **File:** `lib/import/loader.ts:152–177`, `processInvestee` (lines 240–329), `processHolding` (lines 334–393), `processContribution` (lines 457–549), `processMetric` (lines 554–627)
- **What happens:** Every staging row is processed with 5–8 individual DB calls:
  - For investees: 1–2 SELECT to find existing + 1 INSERT or 2 SELECT (before/after) + 1 UPDATE + 1 UPDATE staging
  - For holdings: same pattern, adds 1 extra SELECT to resolve investee from staging
  - For contributions: 1–2 SELECT (dedup) + 1 SELECT (before) + 1 INSERT/UPDATE + 1 SELECT (after) + 1 INSERT (holding_contributions) + 1 UPDATE staging
  - A 5,000-row contribution import triggers ~35,000 sequential DB round-trips.
  - Additionally, after every batch (default 500 rows) a `SELECT + UPDATE` on `import_jobs` to refresh counters adds 2 more queries per batch (lines 181–195).
- **Reproduction:** Upload a CSV with 2,000+ contribution rows and click "Load".
- **Fix:**
  - Batch-lookup existing records: collect all EINs/names/dates in a batch, issue a single `SELECT … WHERE x IN (...)`, build an in-memory lookup map, then process rows against the map.
  - Batch INSERT/UPDATE using Supabase `upsert` with arrays of rows (one query per phase, not per row).
  - Move audit snapshots to a single bulk-insert after each batch rather than per-row.
  - Move counter updates outside the inner loop; update once after the entire phase completes.

---

### 4. Import rollback: per-record sequential DB deletes/updates, no batch limit
- **File:** `lib/import/rollback.ts:75–148`
- **What happens:** Fetches **all** audit entries for a job with no LIMIT (line 75), then issues individual `DELETE` or `UPDATE` per entry in a `for` loop (lines 90–147). A large import (10,000 records) generates 10,000+ sequential DB round-trips and will time out in a serverless function. The audit log also stores full `data_before`/`data_after` JSON blobs, making the payload unbounded in size.
- **Reproduction:** Complete an import with 5,000+ rows, then hit "Rollback". The `/api/admin/imports/[id]/rollback` endpoint will time out (30 s limit).
- **Fix:**
  - Group `insert` operations by table and use `DELETE FROM table WHERE id IN (...)` in one query per table.
  - Group `update` operations by table and use `upsert` (or a single `UPDATE … CASE WHEN`) per table.
  - Add pagination to audit log fetch (process in chunks of 1,000).

---

### 5. Bulk-fix: per-row sequential DB updates (up to 5,000 round-trips)
- **File:** `app/api/admin/imports/[id]/bulk-fix/route.ts:125–156`
- **What happens:** Fetches up to 5,000 staging rows, then for each qualifying row issues a single `UPDATE … WHERE id = row.id` (line 145). 5,000 rows = 5,000 sequential UPDATE queries, easily exceeding the serverless 30 s timeout.
- **Reproduction:** Upload a large CSV with widespread date/EIN format issues (e.g., 2,000+ rows), then click "Apply auto-fixable fixes".
- **Fix:** Collect all `(id, updatedTransformedData, remainingErrors, newStatus)` tuples in an array, then call `supabase.from(stagingTable).upsert(rows, { onConflict: 'id' })` in batches of 500.

---

### 6. metric-comparison API: N sequential queries per holding (SmallMultiples widget)
- **File:** `app/api/portfolio/[id]/metric-comparison/route.ts:67–111`
- **What happens:** For each holding in the portfolio a separate `supabase.from('metric_facts').select(...)` is issued inside a `for` loop. 100 holdings = 100 sequential Supabase queries. The SmallMultiples widget calls this on every mount and on every config change. On a portfolio with 50 holdings, the API response takes 5–10 s; on 100 holdings it will reliably time out.
- **Reproduction:** Open a portfolio with 60+ holdings and add a SmallMultiples widget with `window=all`.
- **Fix:** Replace the per-holding loop with a single batched query:
  ```sql
  SELECT holding_id, period_end, value
  FROM metric_facts
  WHERE holding_id = ANY($holdingIds) AND metric_code = $metricCode AND period_end >= $startDate
  ORDER BY holding_id, period_end
  ```
  Then group by `holding_id` in memory. This is 1 query instead of N.

---

### 7. Timeline API: N+1 holding lookups inside event loop
- **File:** `app/api/portfolio/[id]/timeline/route.ts:43–64`
- **What happens:** The code fetches all events from the `events` table with no LIMIT (line 36), then for each event with an `investee_id` it fires another `.from('holdings').select(...)` query inside the loop (line 44). With 500 events this is 500 additional round-trips. There is also no LIMIT on `holding_contributions` (line 67–71).
- **Reproduction:** A portfolio with a populated `events` table (100+ events) or thousands of contributions.
- **Fix:** Pre-build an `investeeId → holding` map with a single join query (`holdings JOIN investees`). Filter events to portfolio-relevant investees in memory. Add a LIMIT on the events and contributions queries (e.g. 500) with server-side date filtering before the holding check.

---

## 🟡 High (slowdowns, degraded UX)

### 8. Import loader: OFFSET pagination is O(N²) for large staging tables
- **File:** `lib/import/loader.ts:129–207`
- **What happens:** `supabase.from(stagingTable).select('*')…range(offset, offset + batchSize - 1)` uses SQL `OFFSET`. As offset grows, Postgres must scan and discard all preceding rows on each page. For 50,000 rows with a batch size of 500, the last batch causes a full-table scan of 50,000 rows.
- **Reproduction:** Import a 20,000-row CSV; observe that batch processing slows linearly as the load phase progresses.
- **Fix:** Switch to keyset (cursor-based) pagination: track the last processed `id` and use `.gt('id', lastId).limit(batchSize)` with the staging table having an index on `id`.

### 7. PerformanceHeatMap: full D3 SVG teardown + rebuild on every resize
- **File:** `components/vis/PerformanceHeatMap.tsx:226–468`
- **What happens:** The `useEffect` dependency includes `dimensions` (from `useWidgetDimensions`). Every ResizeObserver tick triggers `svg.selectAll('*').remove()` followed by a complete SVG rebuild. For a 50-holding × 260-week heatmap (13,000 cells), each resize causes 13,000 DOM append calls and 13,000 event-listener registrations.
- **Reproduction:** Load a heatmap with 50+ holdings on "all time" window; resize the browser window. CPU spikes to ~100% for several seconds.
- **Fix:**
  - Use D3 data joins (`selectAll('.cell').data(flatCells).join(...)`) instead of `holdings.forEach(… columns.forEach(…  g.append(…)))`.
  - Separate layout-only changes (scale domains, viewBox) from data-bind changes; only do a full rebuild when data changes, not on resize.
  - Add a debounce to the resize handler.

### 8. PerformanceHeatMap: individual DOM appends in nested forEach loop (no D3 joins)
- **File:** `components/vis/PerformanceHeatMap.tsx:284–362`
- **What happens:** `holdings.forEach((holding, i) => { columns.forEach((col, j) => { … g.append('g')…append('rect')…append('text') … }) })` bypasses D3's virtual DOM diffing. For large matrices, React re-run + D3 append of 13,000 `<g>` elements with individual event listeners causes multi-second paints.
- **Fix:** Use `g.selectAll('.cell').data(matrix.flat()).join('g')` for enter/update/exit semantics. This allows D3 to reuse existing DOM nodes on data changes.

### 9. ImpactTimeline (horizontal): all events drawn as individual DOM nodes, no virtualization
- **File:** `components/vis/ImpactTimeline.tsx:295–346`
- **What happens:** Every event in `sortedEvents` is drawn with 3–4 individual `.append()` calls inside a `forEach` loop. For a 5-year portfolio with weekly milestones (~260 events), 1,000+ DOM nodes are created every render. The SVG has a fixed height of 200px so most nodes are invisible but still parsed/painted.
- **Reproduction:** Load a holding with 5+ years of weekly metric events in horizontal timeline mode.
- **Fix:** Implement a sliding-window view: only render events within the visible viewport plus a buffer. Use `xScale` to filter `sortedEvents` to visible range before entering the draw loop.

### 10. QuickBooks export/contributions: no LIMIT + sequential API calls, no batching
- **File:** `app/api/integrations/quickbooks/export/contributions/route.ts:64–133`
- **What happens:** All contributions for a tax year are fetched with no LIMIT (line 64–72). A user with years of giving could have thousands of rows. The export then issues `await createJournalEntryAsync(...)` one-at-a-time in a `for` loop — one HTTP request to QuickBooks per contribution. QuickBooks rate-limits at ~10 req/s; 500 contributions × ~200 ms/request = ~100 s minimum. The Next.js serverless function times out at 30 s.
- **Reproduction:** Export contributions for a tax year with 200+ transactions.
- **Fix:** (1) Add a per-request LIMIT (e.g. 1,000) and expose pagination to the caller. (2) QuickBooks supports a `Batch` endpoint (`/v3/company/{realmId}/batch`) allowing up to 30 operations per batch call. Group journal entries into batches of 30 and issue one HTTP call per batch.

### 10a. QuickBooks export/grants: same sequential API call pattern as contributions
- **File:** `app/api/integrations/quickbooks/export/grants/route.ts:100–146`
- **What happens:** Identical issue — no LIMIT on grants fetched, sequential `createJournalEntryAsync` calls in a `for` loop. For portfolios with 100+ grant-type holdings, this will hit the same timeout.
- **Reproduction:** Export grants on a portfolio with 100+ grant holdings.
- **Fix:** Same as above — add LIMIT and use QB Batch API.

### 11. Board-report API: fetches all holdings without LIMIT
- **File:** `app/api/portfolio/[id]/board-report/route.ts:34`
- **What happens:** `sb.from('holdings').select('name, value_usd, asset_class, sector').eq('portfolio_id', portfolioId)` has no row limit. With 1,000+ holdings, the full dataset is loaded into server memory before PDF generation. The `generateBoardReportPDF` function on the server (running on Node.js edge/serverless) must hold all this data in one synchronous jsPDF call.
- **Fix:** Cap to top-N holdings by value before PDF generation (e.g., `.order('value_usd', { ascending: false }).limit(200)`). The PDF already slices to 10 top holdings at line 170 anyway.

### 12. Import report endpoint: 5 sequential `countStagingRows` calls (15 queries total, sequential)
- **File:** `app/api/admin/imports/[id]/report/route.ts:87–89`
- **What happens:** The loop `for (const [entity, table] of Object.entries(stagingTables))` calls `countStagingRows` sequentially for 5 entities. Each call fires 3 parallel `COUNT` queries internally (via `Promise.all`), but the 5 entities are not parallelised — adds 5× latency overhead.
- **Fix:** Replace the `for` loop with `Promise.all(Object.entries(stagingTables).map(...))`.

### 12a. Reconciler: fetches full JSONB rows to compute amount sum
- **File:** `lib/import/reconciler.ts:200–210`
- **What happens:** `reconcileContributions()` fetches `SELECT transformed_data FROM staging_import_contributions WHERE ...` with no LIMIT to sum `amount_usd` values in Node.js. For a 10,000-row import this loads 10,000 large JSONB blobs into the serverless function's memory, potentially causing OOM or slow GC.
- **Fix:** Push the aggregation to PostgreSQL: `SELECT SUM((transformed_data->>'amount_usd')::numeric) FROM staging_import_contributions WHERE import_job_id = $1 AND validation_status IN ('valid','warning')` via `supabase.rpc()`.

### 12b. Reconciler: large IN clause on `tax_contributions` risks URL limit and seq-scan
- **File:** `lib/import/reconciler.ts:224–230`
- **What happens:** `.in('id', taxIds)` where `taxIds` may contain 5,000+ UUIDs. PostgREST serialises this as a URL query parameter; requests exceeding ~8 KB are rejected. Even when accepted, PostgreSQL may switch from an index seek to a seq-scan for IN lists larger than ~1,000 elements.
- **Fix:** Push the sum aggregation to PostgreSQL (see 12a). If IN is still needed, chunk `taxIds` into batches of 500 and issue parallel sub-queries.

### 12c. SmallMultiples: one ResizeObserver per mini-chart card
- **File:** `components/vis/SmallMultiples.tsx:170–179`
- **What happens:** Each `SmallChart` mounts its own `ResizeObserver` that calls `setWidth()`, triggering a React state update and re-render per card. With 50 cards, a single window resize fires 50 separate state updates → 50 re-renders → 50 D3 rebuilds in rapid succession. This causes visible frame drops.
- **Reproduction:** Render SmallMultiples with 30+ holdings and resize the browser window.
- **Fix:** Lift the ResizeObserver to the `SmallMultiples` container, compute `cardWidth` once, and pass it as a prop to all `SmallChart` children. This reduces N observers to 1.

---

## 🟢 Low (minor improvements)

### 13. PerformanceHeatMap: random gradient ID leaks `<defs>` elements
- **File:** `components/vis/PerformanceHeatMap.tsx:431`
- **What happens:** `const gradientId = 'heat-map-gradient-' + Math.random().toString(36).substr(2, 9)` generates a new ID each render. Since `svg.selectAll('*').remove()` is called but `defs` is appended to the parent `svg` (not `g`), gradient defs from previous renders may accumulate.
- **Fix:** Use a stable ID (e.g., based on `portfolioId` + metric code) and use `svg.select('#' + gradientId)` with a merge pattern to avoid duplicate `<defs>`.

### 14. HoldingsTable: no virtualization for large row counts
- **File:** `components/HoldingsTable.tsx:369–435`
- **What happens:** All rows in `data` are rendered unconditionally into the DOM. With 500+ holdings, React must reconcile all rows on every sort-column click, and the browser must paint all table rows.
- **Fix:** Integrate `@tanstack/react-virtual` or `react-window` to virtualise rows, only rendering the ~20 visible rows at a time.

### 15. Rollback: no LIMIT on audit log fetch risks memory exhaustion
- **File:** `lib/import/rollback.ts:75–82`
- **What happens:** `supabase.from('import_audit_log').select('*')…` (no limit) loads full JSON snapshots (before/after) for every operation. For a 10,000-row import, this is 10,000 rows × potentially large JSON blobs loaded into a single serverless function invocation.
- **Fix:** Add `.limit(10000)` (or paginate) and log a warning if the limit is reached. Consider storing only the record IDs in the rollback path rather than full snapshots.

### 16. All visualization API routes: `Cache-Control: no-store` on all responses
- **Files:** `app/api/portfolio/[id]/heat-map/route.ts`, `app/api/portfolio/[id]/bubble-chart/route.ts`, `app/api/portfolio/[id]/timeline/route.ts`
- **What happens:** Every render of a chart component fetches fresh data from the server (`cache: 'no-store'` in fetch calls, matching `Cache-Control: no-store` server responses). Navigating away and back re-fetches all chart data with no HTTP caching.
- **Fix:** For historical/stable chart data, use short-lived stale-while-revalidate caching (`Cache-Control: s-maxage=60, stale-while-revalidate=300`). For the SWR client calls, use a key with a TTL.

---

## Summary

- **7 critical**, **10 high**, **4 low** issues found.
- **Overall performance assessment:** The API routes backing D3 visualisations (`/bubble-chart`, `/heat-map`, `/metric-comparison`, `/timeline`) all contain N or N×M sequential database query loops that will time out with realistic portfolios (50+ holdings, 3+ metrics). The import pipeline (loader, bulk-fix, rollback) compounds this with per-row serialised DB calls that make any import exceeding ~200 rows effectively un-completable within serverless time limits. Fixing these requires replacing the per-row patterns with batch/bulk DB operations throughout — this is the single highest-leverage change available to the application.
