# Executive Director — QA Findings

_Traced all flows as a first-time user of the app: portfolio dashboard, holdings list, board report PDF, grants, KPIs, D3 visualizations, recommendations, and performance._

---

## 🔴 Critical (will crash or data loss)

### [1] Board Report PDF: `value_usd` column doesn't exist — all holdings show $0
- **File:** `app/api/portfolio/[id]/board-report/route.ts:34`
- **What happens:** The board-report API selects `value_usd` from the `holdings` table. This column does not exist anywhere in the schema (the actual column is `funds_allocated`). Supabase silently returns `undefined` for the field. Every `h.value_usd ?? 0` evaluates to `0`. The cover-page "Total Portfolio Value" callout shows **$0**. All three asset-class, sector, and top-holdings tables are populated with `$0.00` rows. The PDF looks completely broken.
- **Reproduction:** Click "Board Report PDF" on any portfolio with holdings.
- **Fix:** Change `select('name, value_usd, asset_class, sector')` → `select('name, funds_allocated, asset_type, sector')` and update all downstream references (`h.value_usd` → `h.funds_allocated`, `h.asset_class` → `h.asset_type`).

---

### [2] Board Report PDF: `asset_class` column doesn't exist — all holdings bucketed as "Other"
- **File:** `app/api/portfolio/[id]/board-report/route.ts:35, 57-58`
- **What happens:** Migration `0017_asset_type_enum.sql` (steps 1 & 7) renamed `asset_class` → `asset_type_text` and then dropped it entirely, replacing it with the `asset_type` enum column. The board-report route still queries `asset_class`, which no longer exists. Every holding resolves to `h.asset_class ?? 'Other'` = `'Other'`. The asset-class breakdown table in the PDF shows a single row: `Other | $0.00 | NaN%`.
- **Reproduction:** Same as above — any board report PDF.
- **Fix:** See fix for issue #1 above (both columns fixed together on line 34).

---

### [3] Board Report PDF: queries non-existent table `portfolio_kpis` — KPI section always empty
- **File:** `app/api/portfolio/[id]/board-report/route.ts:41`
- **What happens:** The route queries `sb.from('portfolio_kpis')`. This table does not exist in any of the 51 database migrations. Supabase returns `{ data: null, error: ... }`. The destructuring picks only `data`, so `kpiSeries` is `null`. `kpiSeries ?? []` → `[]`. The "Key Performance Indicators" section is silently omitted from every board report, even for portfolios with many configured KPIs.
- **Reproduction:** Any board report for a portfolio with KPIs configured.
- **Fix:** Replace with `sb.from('v_portfolio_kpi_latest').select('metric_name, value, unit').eq('portfolio_id', portfolioId).limit(12)` and map `metric_name` → `name`.

---

### [4] XIRR / IRR calculation is a permanent TODO stub — never computed
- **File:** `lib/schemas/investment.ts:151–156`
- **What happens:** `calculateIRR()` contains only a `// TODO: Implement XIRR calculation` comment and always returns `null`. The `InvestmentPerformance` type has no `irr` field. Any board-level discussion of investment IRR would require a manual export to Excel. The function has existed as a stub through the entire codebase history.
- **Reproduction:** Check any holding with multiple cash-flow transactions — IRR/XIRR is completely absent from the UI.
- **Fix:** Implement Newton-Raphson XIRR using the existing `transactions` table (`transaction_date`, `amount`). Add `xirr?: number | null` to `InvestmentPerformance` and surface it in `InvestmentPerformanceCard`.

---

## 🟡 High (bad UX, confusing, likely to cause support requests)

### [5] ImpactTimeline horizontal mode: single event produces invisible rendering
- **File:** `components/vis/ImpactTimeline.tsx:269–275`
- **What happens:** When the timeline API returns exactly 1 event, `d3.min` and `d3.max` both return the same date. The D3 time scale domain becomes `[date, date]` — a degenerate range. `(value - domainMin) / (domainMax - domainMin)` = `0/0` = `NaN`. The event circle is placed at `translate(NaN, height/2)`, which SVG ignores — it doesn't render. The user sees only a horizontal gray line.
- **Reproduction:** Add a single milestone to a new holding and configure an ImpactTimeline widget in horizontal mode.
- **Fix:** Pad the domain when min === max: `const pad = 7 * 24 * 3600 * 1000; domain = [new Date(minT - pad), new Date(maxT + pad)]`. The BubbleChart has `minHoldings` guard — add `minEvents: 1` guard or domain padding.

---

### [6] KpiTrend widget: blank white box when metric has no historical data
- **File:** `components/vis/KpiTrend.tsx:107`
- **What happens:** After the fetch resolves with an empty series (`parsed.length === 0`), the `useEffect` D3 handler clears the SVG and returns early without drawing anything. The loading skeleton disappears, but the component renders an empty `<svg>` element — a blank white rectangle with no message. A new user would think the widget is broken.
- **Reproduction:** Add a KpiTrend widget for a metric with no recorded data points.
- **Fix:** Add an empty-state branch: `if (!parsed.length) { /* render "No data yet for [metric]" text inside the SVG or replace the SVG with a div */ return; }` — the BubbleChart and WaterfallChart both do this correctly.

---

### [7] HoldingsSection: hard-capped at 100 holdings, no pagination — 500+ holding portfolios silently truncated
- **File:** `components/HoldingsSection.tsx:18`
- **What happens:** The SWR fetch uses `limit=100`. The API supports up to 200 per page and returns a `nextOffset` cursor. `HoldingsSection` ignores both the cursor and the total `count`. For a foundation with 500+ holdings (not unusual for a diversified DAF), only the 100 most recently created holdings appear. There is no "Load more" button, no count badge ("Showing 100 of 523"), and no indication data is missing. An ED comparing total to a custodian report would see a discrepancy with no explanation.
- **Reproduction:** Create or import 101+ holdings on a portfolio.
- **Fix:** Use the `count` and `nextOffset` from the API response to show `Showing {rows.length} of {count}` and add a "Load more" button that fetches the next page via `mutate`.

---

### [8] Recommendations: complete backend with zero frontend — invisible to users
- **File:** `app/api/portfolio/[id]/recommendations/route.ts` (GET/POST)
- **What happens:** A full CRUD API exists for portfolio recommendations (with favorites, ratings, comments, and status tracking). However, searching the entire `components/` and `app/dashboard/` tree reveals **no component or page that fetches or renders these recommendations**. An admin can create recommendations via direct API call, but portfolio viewers have no way to discover them. The "Recommendations" API surface is completely dark to end-users.
- **Reproduction:** POST a recommendation to any portfolio via the API. Navigate every dashboard page — it does not appear anywhere.
- **Fix:** Add a `RecommendationsSection` component (analogous to `HoldingsSection`) to the dashboard, or a `/dashboard/recommendations?portfolio_id=...` page.

---

### [9] PortfolioSummarySection: network failures silently show "No Holdings Yet" empty state
- **File:** `components/PortfolioSummarySection.tsx:82–88`
- **What happens:** The `fetchData` function wraps all three parallel API calls in a single `try/catch`. If any of them fails (network timeout, 500, auth expiry), the `catch` block only calls `console.error`. `investmentSummary`, `grantSummary`, and `donationSummary` remain `null`. The "all" tab then renders "No Holdings Yet" with a mailbox icon — indistinguishable from a genuinely empty portfolio.
- **Reproduction:** Disable the API (e.g., environment variable) and load the dashboard.
- **Fix:** Add an `error` state and a visible error banner: `"Could not load portfolio summary — please refresh."` Inspect each individual response `ok` flag before marking data as "truly absent."

---

### [10] Grant detail and list views: no dedicated UI — individual grants invisible
- **File:** `components/GrantSummaryCard.tsx` (defined but never imported by any page)
- **What happens:** The `GrantSummaryCard` component and the full grants API (`/api/portfolio/[id]/grants`, `/holdings/[id]/grant-details`, milestones, transactions) are built out, but there is no page or component that renders a list of individual grants. The "Grants" tab in `PortfolioSummarySection` shows only aggregate numbers (`total_grants`, `active_grants`, `total_amount`). An ED cannot drill into a specific grant, see its milestone status, review the next report due date, or track status transitions without leaving the app.
- **Reproduction:** Switch to the "Grants" tab on a portfolio with multiple grants — you see only summary numbers, no rows.
- **Fix:** Render `<GrantSummaryCard>` in a scrollable list within `PortfolioGrantSummaryCard` or add a `/dashboard/grants?portfolio_id=...` page analogous to the holdings list.

---

## 🟢 Low (polish, minor improvements)

### [11] PerformanceHeatMap: all-null data matrix renders blank SVG (no empty state)
- **File:** `components/vis/PerformanceHeatMap.tsx:260`
- **What happens:** When the API returns data rows but all `value` fields are `null` (no metrics recorded yet), the `allValues` array is empty. The D3 `useEffect` detects `allValues.length === 0` and returns early, leaving the SVG cleared. Because `holdings.length >= minHoldings` passed the outer guard, the component renders a blank SVG element instead of showing "No data available."
- **Fix:** Add a guard after the `allValues` computation: `if (allValues.length === 0) return` in the outer component (render an inline empty-state message before calling `<HeatMapChart>`).

---

### [12] Board Report PDF: very long portfolio names overflow the cover page header
- **File:** `lib/pdf/board-report-generator.ts:49`
- **What happens:** `doc.text(data.portfolioName, MARGIN, 70)` renders the full name without truncation. A name like "The Ashford-Wellington Family Charitable Foundation for Environmental Stewardship" (78 chars) will overflow the 176 mm content width and bleed over the edge of the purple cover block.
- **Fix:** Truncate to ~60 characters with an ellipsis: `const safeName = data.portfolioName.length > 60 ? data.portfolioName.slice(0, 57) + '…' : data.portfolioName;` and use `safeName` in `doc.text(...)`.

---

### [13] KpiTrend: three `console.log` debug statements left in production code
- **File:** `components/vis/KpiTrend.tsx:37, 44, 48`
- **What happens:** Every KpiTrend widget emits `[KpiTrend] Fetching metric: ...`, `[KpiTrend] Response for ...:`, and `[KpiTrend] ✓/✗ Got N data points` to the browser console. On a dashboard with 8 KPI trend widgets, this produces 24 log lines per page load. Any user opening DevTools to investigate an unrelated issue will see a polluted console, and the logged response objects may surface internal metric codes and values.
- **Fix:** Remove or convert to `process.env.NODE_ENV === 'development'` guards.

---

### [14] HoldingsTable footer: dead ternary `colSpan={canEdit ? 5 : 5}`
- **File:** `components/HoldingsTable.tsx:430`
- **What happens:** The `<tfoot>` "Total" label cell has `colSpan={canEdit ? 5 : 5}` — both branches are `5`, making the condition dead code. It happens to render correctly because 5 label columns + 1 value column + (1 action column if `canEdit`) = 6 or 7, which is correct. But the intent is unclear to future developers.
- **Fix:** Simplify to `colSpan={5}` or change to `colSpan={canEdit ? 5 : 5}` → `colSpan={5}`.

---

## Summary

- **4 critical, 6 high, 4 low issues found**
- **Overall assessment:** The board report PDF — the primary deliverable used in board meetings — is broken across all three data sections (portfolio value is $0, asset class breakdown is useless, KPI section is empty) due to stale column and table names that were never updated after a schema migration. Separately, a complete recommendations feature exists in the API layer but has no UI, and grant details are not surfaced to portfolio viewers. These gaps would generate significant confusion at the first board meeting or portfolio review.
