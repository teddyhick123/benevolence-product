# Impact Visualizations / Widgets — Module Review

**Reviewer:** Senior Product Engineer  
**Date:** 2026-04-26  
**Base path:** `components/vis/`, `app/api/portfolio/[id]/`  
**Scope:** 14 widget types, carousel host, create/edit modals, 8 dedicated API routes

---

## Visualization Quality Assessment

### KPI Trend Line (`components/vis/KpiTrend.tsx`)
**Rating: 7/10**

Solid implementation. Uses `d3.scaleUtc` correctly for time, gradient area fill adds depth, clip-path prevents overflow, and a bisector-based hover crosshair with a floating label works well. Supports optional `curveMonotoneX` smoothing.

**Issues:**
- No tooltip card — hover shows a raw floating `<text>` element with the numeric value only. No date is shown on hover, which is a hard gap for a trend chart. (Lines 217–245)
- `console.log` debug statements left in production code throughout the `useEffect` fetch block (lines 37–49). Logs include `✓` / `✗` symbols. This is noise in prod and leaks metric codes to the browser console.
- ResizeObserver wiring is unnecessarily split across two observers (`roWrap` / `roCont`) and uses stale closure on `w`/`h` state, potentially causing missed updates (lines 64–79). All other widgets use the shared `useWidgetDimensions` hook — `KpiTrend` does not, making it an outlier.
- Y-axis ticks use raw number format without currency or unit awareness. A metric coded `USD_GRANTS` would render `1500000` instead of `$1.5M`.

### Radial Progress (`components/vis/RadialProgress.tsx`)
**Rating: 8/10**

The strongest-looking widget. Animated progress arcs with glow filter, sunset color palette, gradient fills, and a clean multi-ring legend below. Supports 1–3 rings, both static value and live metric-code fetch modes, and works for holding-level or portfolio-level KPIs.

**Issues:**
- `console.log` / `console.error` / `console.warn` debug calls throughout the fetch effect (lines 78–99). Same issue as KpiTrend.
- Multi-ring center text shows the raw count of rings ("3 KPIs") rather than anything meaningful — an aggregate completion percentage or a primary KPI value would be more useful for board slides.
- No tooltip on ring hover — cannot tell which ring corresponds to which KPI without reading the legend.
- `SIZE` is capped at 320px regardless of container (line 126). On a large monitor the ring looks tiny inside the 500px carousel card.

### Impact Bubble Chart (`components/vis/ImpactBubbleChart.tsx`)
**Rating: 7.5/10**

Good foundations: proper `scaleSqrt` for bubble sizes (perceptually correct), three color modes (sector / asset_type / metric gradient), clickable bubbles that navigate to holding detail pages, and a generated legend. Axes are labeled and grid lines are present.

**Issues:**
- Legend is positioned by hardcoded offset `width - 120` (line 390). With many sectors it overlaps bubbles — no scroll or overflow handling.
- Labels on bubbles (when `showLabels: true`) are drawn inside the circle regardless of bubble size. A 10px bubble with a 10px label text is unreadable (lines 369–380).
- Tooltip uses `event.pageX` / `event.pageY` (absolute screen coordinates) but the tooltip `div` is positioned `absolute` inside the container (line 419). On a scrolled page the tooltip appears offset from where the cursor is. Should use `event.offsetX`/`event.offsetY` or `d3.pointer`.
- `colorScale` is cast as either `ScaleOrdinal` or `ScaleSequential` with `as` casts rather than a union type — fragile if `colorMode` changes after initial render.
- No zoom or pan for dense portfolios (30+ holdings). Overlapping bubbles are unclickable.

### Performance Heat Map (`components/vis/PerformanceHeatMap.tsx`)
**Rating: 7/10**

Dynamic cell sizing based on container, rotated column headers, gradient legend with axis, and rounded rect cells with hover highlight. Supports both temporal and metrics modes.

**Issues:**
- `gradientId` uses `Math.random()` (line 431), which causes a new ID on every render — this is safe but unnecessary. The `useMemo`-based approach from `KpiTrend`/`RadialProgress` is better practice.
- `style='transition: all 0.2s ease'` on SVG `<rect>` elements (line 304) — CSS `transition` on SVG stroke/fill is not cross-browser reliable; D3 `.transition()` is the correct approach.
- When `showValues` is false (default) the cells show no readable label — users cannot distinguish between, say, 1,000 and 9,500 unless they hover every cell. For a board presentation this matters.
- Color contrast for text on colored cells uses a fixed 60% threshold (line 348), which is incorrect — proper WCAG contrast requires luminance comparison, not value threshold. Dark-colored cells with a 60%+ value will show white text incorrectly.
- The `window` shadowed variable (line 39: `const window = config?.window`) shadows the global `window` object. TypeScript doesn't flag it due to the `string` annotation, but it is confusing and a potential source of bugs if the name is ever used for DOM access in the same scope.

### Waterfall Chart (`components/vis/WaterfallChart.tsx`)
**Rating: 5.5/10**

The D3 rendering is structurally correct — cumulative positioning logic works, connector lines are drawn behind bars, `scaleBand` with padding is appropriate.

**Critical Bug — connector logic**: Connector lines use the outer `cumulative` variable from the parent scope at the point the `forEach` runs (line 306: `const y = yScale(cumulative)`). By the time all bars have been processed, `cumulative` holds the final total, so every connector is drawn at the wrong Y position. The per-bar cumulative is recomputed inside the loop (lines 308–316) but the initial `const y = yScale(cumulative)` assignment on line 306 is incorrect and misleading (the `y` variable is never used — lines are drawn using `cumulativeAtEnd` on line 320). The code works because the `y` variable is unused, but the dead code is confusing and indicates the logic was written incorrectly and then patched.

**Issues:**
- `funding` and `impact` modes in the API route (`app/api/portfolio/[id]/waterfall/route.ts`, lines 53–148) both use `funds_allocated` as a proxy for impact. The "impact waterfall" is literally identical in data to the "funding waterfall" — it shows funding allocation, not actual impact metrics. This is misleading to a board audience (lines 95–96 comment acknowledges this: "For simplicity, use funds_allocated as a proxy for impact").
- Tooltip: the waterfall has no hover tooltip at all — values are only visible as labels above bars when `showValues: true`. Hovering a bar shows nothing.
- `metric` mode issues N+1 queries (one `metric_facts` query per holding, lines 196–217 in the route). With 30 holdings this is 30 sequential DB round-trips.

### Impact Timeline (`components/vis/ImpactTimeline.tsx`)
**Rating: 6/10**

Two rendering modes: a D3 horizontal SVG timeline and a pure-React vertical card list. The vertical mode is the most readable and handles grouping by holding.

**Issues:**
- `HorizontalTimeline` does not use `useWidgetDimensions`. It reads `container.clientWidth` directly (line 250) but sets the SVG width once on mount; it does not re-render on resize (no `ResizeObserver`). The horizontal timeline breaks on window resize.
- Events from the API (`app/api/portfolio/[id]/timeline/route.ts`) pull metric facts and flag any `value >= 100` as a "milestone" (line 118). This hardcoded threshold is inappropriate — 100 job placements could be a milestone but 100 USD granted would not be.
- The `events` table query (line 46) fetches up to 500 rows with `.limit(500)` and no `portfolio_id` filter — it pulls all events for the entire database, then filters in JS by `investee_id`. This is a correctness and performance bug.
- Horizontal timeline label text truncated at 20 chars (line 333) but no tooltip fallback (`title` attribute) — the full event title is permanently lost.
- A click on a horizontal timeline event dot calls `onEventClick` which opens a modal, but the modal uses `fixed inset-0` z-index and stacks on top of any other modal — if the timeline is inside the carousel, the backdrop stacks incorrectly.

### Holdings Comparison Table (`components/vis/HoldingsComparisonTable.tsx`)
**Rating: 8/10**

The cleanest widget. Proper `useMemo` for sort, directionality-aware "best value" highlighting, responsive (desktop table / mobile card), click-to-navigate, and a clear empty state.

**Issues:**
- Metrics array from `config.metrics` is passed directly as a `useEffect` dependency (line 92: `[portfolioId, metrics]`) — since `metrics` is derived as `config?.metrics || []` on line 41, it creates a new array reference on every render. This causes the effect to re-fire on every parent re-render. The fix is `useMemo` wrapping (as done in `PerformanceHeatMap`).
- No column header tooltip showing units or directionality information. A board member cannot know if "lower is better" without reading the footnote.

### Small Multiples (`components/vis/SmallMultiples.tsx`)
**Rating: 7/10**

Good concept for comparing a single metric across all holdings with sparklines plus trend indicator and percent change badge. Click-to-navigate works.

**Issues:**
- Each `SmallChart` uses its own `ResizeObserver` on `containerRef` (lines 169–176). With 20 holdings that is 20 simultaneous observers. Should share a grid-level observer.
- Y-axis domain starts at 0 always (line 213: `.domain([0, d3.max(...)])`) — for a metric like "percent of households with clean water" that ranges 75–95%, the chart looks flat. Should offer a "start from min" option or auto-detect.
- No axes or tick labels on the sparklines — appropriate for sparklines but the metric units and date range are shown nowhere on the chart.
- `window` is again a shadowed variable name (line 39).

### Holdings Pie Widget (`components/vis/HoldingsPieWidget.tsx`)
**Rating: 8/10**

Clean React-D3 hybrid. Uses pure React + `d3-shape`/`d3-scale` for arc/color computation but renders with React SVG elements rather than imperative D3. This is the correct modern pattern. `ResizeObserver` on `chartRef`, `useMemo` for arcs and total.

**Issues:**
- No hover interaction on pie slices — the only affordance is an SVG `<title>` tooltip which browsers render inconsistently. A proper HTML tooltip card is missing.
- No click-to-filter interaction — clicking a slice could highlight or filter the holdings table below, a natural user expectation.
- `innerRadius` has no accessible label in the center for `innerRadius === 0` (full pie) mode.
- Legend is a fixed 220px wide div which overflows on narrow containers.

### People Grid Widget (`components/vis/PeopleGridWidget.tsx`)
**Rating: 9/10**

Excellent. The layout algorithm (lines 96–121) is genuinely clever: it searches a range of column counts to maximize icon size given the available rectangle. The `useId`-based clip path per icon avoids ID collisions across multiple instances. Partial fill fraction for the last icon is a nice detail. `DEBUG_GRID` flag is present but defaults to `false` — acceptable for MVP.

**Issues:**
- `ResizeObserver` has a stale-closure bug (lines 75–88): `roGrid` updates `dims.w` but calls `update(dims.w, e.contentRect.height)` — at this point `dims.w` is captured from the closure at the time of effect creation, not the current value. If width changes first, the subsequent height update will use the old width. Should read both dimensions from the `container.getBoundingClientRect()` at update time.

### Sector Emissions Bar (`components/vis/SectorEmissionsBar.tsx`)
**Rating: 5/10**

Functional but barebones. The only bar chart in the system — horizontal bars sorted by sector value.

**Issues:**
- No X-axis rendered (line 75 only calls `axisLeft(y)`). Without an X-axis, absolute values are unreadable without hovering each bar — but there are no tooltips either. Values are text-appended beside bars, which works, but an X-axis is still best practice.
- No error state: if the fetch fails (no `if (!r.ok)`) the component silently shows nothing (lines 22–47). `setLoading(false)` is called in `finally` but `setRows([])` is only called on success path.
- Cannot filter to a specific holding — it aggregates across the whole portfolio only.
- Hard-coded default metric `FEMISS` (line 10) — not communicated to the user anywhere.

### D3 JSON Widget (`components/vis/D3JsonWidget.tsx`)
**Rating: 6/10**

A powerful escape hatch supporting bar, line, area, scatter, pie, donut from a JSON spec. Good for power users.

**Issues:**
- The configuration experience ("Advanced configuration coming soon" in `CreateWidgetModal.tsx` line 546) means end users cannot configure this widget at all through the UI — it is only accessible by directly editing the database `config` column. This defeats the no-code promise.
- Pie legend items overflow horizontally at 90px each (line 341: `i * 90`) — with more than 5 categories, legend items run off the SVG.
- No caching of the dynamic D3 import — `await import('d3')` is called inside the `useEffect` on every render (line 39). Next.js module cache handles this, but it is an unnecessary async micro-delay.

---

## Widget System Architecture

### Widget Registry (`components/vis/registry.ts`)
**Critical Gap:** The file exports `widgetRegistry` with only 3 entries (`kpi_trend`, `emissions_bar`, `d3_json`). The actual runtime registry lives in `components/vis/VisualCarousel.tsx` (lines 222–237) as a local constant `REGISTRY` with 14 entries. These two registries are out of sync. If any code imports `widgetRegistry` from `registry.ts` it will miss 11 widget types.

### Carousel Host (`components/vis/VisualCarousel.tsx`)
The carousel is well-built: touch swipe, keyboard nav (`←/→/Home/End`), autoplay with hover/focus pause, mobile dot indicators, and desktop pill navigation. However:

- Fixed height `h-[500px]` (line 325) on the carousel card. A waterfall chart with 15 holdings needs more vertical space; a radial progress widget wastes most of the 500px. Widget-height should be configurable per widget type.
- "Neighbor-only" mounting (line 364: `Math.abs(i - index) <= 1`) is good for performance but means D3 `useEffect` re-runs every time the user navigates — triggering a full API refetch. There is no inter-slide data cache.
- No loading indicator while slide content loads — the spinner is per-widget but the carousel itself shows nothing during the transition between slides.

### Widget Management (`components/vis/EditWidgetsModal.tsx`)
Good accessibility work: focus trapping (lines 76–89), Escape key is handled by the backdrop click, aria roles are correct, optimistic UI for reorder with revert on error (line 212).

**Issues:**
- Position reorder uses three sequential API calls (lines 150–183) to avoid a `UNIQUE` constraint — a position swap via a single SQL `UPDATE ... CASE WHEN` statement would be one round-trip. At 3 calls, there is a visible delay on reorder.
- Drag and drop only supports adjacent-swap semantics (same as arrow buttons). True drag-to-any-position is implemented for the drop handler but calls `reorderWidgets` which only swaps two positions — if you drag item 1 to position 5, items 2–4 do not shift.

### Widget Config Forms (`components/vis/widget-configs/`)
All config forms fetch available metrics from `/api/portfolio/[id]/kpis?has_data=true` which is the right approach. The forms are uniform in structure and clear.

**Issues:**
- No live preview inside the config form. Users configure a widget, save it, then see the result — a common frustration pattern. Flourish and Tableau both show real-time previews.
- `KpiTrendConfig.tsx` falls back to a text input when `availableMetrics` is empty (lines 86–96). The fallback requires users to know their metric codes exactly. A search-as-you-type select would be safer.

---

## Competitive Assessment

### vs. Tableau / Power BI
Benevolence widgets are more narrowly focused (philanthropy-specific) which is appropriate. However Tableau wins on: calculated fields, cross-filter interactions between charts, annotations on data points, and drill-down. Benevolence has none of these.

### vs. Flourish
Flourish's story-telling advantage is narrative annotations, slide-by-slide story building, and export-to-presentation. Benevolence's carousel approximates the slide concept but lacks the narrative layer — no text annotations, no callout overlays, no "story" framing.

### vs. Blackbaud Analytics
Benevolence is significantly ahead on visualization quality and configurability. Blackbaud's reporting is table-heavy with static charts. The bubble chart and radial progress widgets are genuine differentiators.

### vs. 60 Decibels / ImpactMapper
These platforms excel at survey-based impact data and standardized frameworks (IRIS+, GIIRS). Benevolence's custom metric system is flexible but does not map to standard impact frameworks, making cross-portfolio benchmarking against industry data impossible. For a foundation pitching board members who ask "how do we compare to peers?", this is a gap.

**Key competitive differentiator to lean into:** The click-to-holding navigation across all widgets creates a unique drill-down experience that static BI tools cannot replicate. The bubble chart → holding detail flow is genuinely compelling.

**Key competitive gap:** No print/PDF export, no board deck export, no share link for a specific widget view.

---

## Bugs & Reliability Issues

### Severity: High

1. **Timeline API fetches all events without portfolio filter** (`app/api/portfolio/[id]/timeline/route.ts`, line 46): `from('events').select('*')` with no `portfolio_id` filter. Pulls the entire `events` table (potentially millions of rows) and filters in JS. Will degrade performance with any significant data volume and could expose data cross-portfolio if RLS is not configured on the `events` table.

2. **Waterfall `impact` mode shows wrong data** (`app/api/portfolio/[id]/waterfall/route.ts`, lines 89–148): The `impact` mode is documented as "impact accumulation" but uses `funds_allocated` — the same field as `funding` mode. The resulting chart is identical to the funding waterfall, which is misleading to any foundation executive or board member.

3. **Tooltip coordinate bug in Bubble Chart** (`components/vis/ImpactBubbleChart.tsx`, lines 351–353): `event.pageX` / `event.pageY` are absolute page coordinates. The tooltip `div` is `position: absolute` inside the SVG container. On any page with scroll, the tooltip appears in the wrong position. Should use `d3.pointer(event, containerRef.current)` or `event.offsetX`.

4. **Registry out of sync** (`components/vis/registry.ts`): Exports only 3 widget types; actual carousel runtime supports 14. Any consumer of the exported registry misses 11 types.

### Severity: Medium

5. **N+1 query in waterfall `metric` mode** (`app/api/portfolio/[id]/waterfall/route.ts`, lines 196–217): One sequential DB query per holding inside a `for...of` loop. Should be batched like the `bubble-chart` route.

6. **HoldingsComparisonTable `metrics` array re-effect** (`components/vis/HoldingsComparisonTable.tsx`, line 92): `metrics` is a new array reference on every render, causing the data fetch to re-run constantly. Add `useMemo` for the metrics array.

7. **SectorEmissionsBar has no error state** (`components/vis/SectorEmissionsBar.tsx`, lines 22–47): A failed API call results in silent empty state — no error message to the user.

8. **KpiTrend production console.log spam** (`components/vis/KpiTrend.tsx`, lines 37–49): 3–4 `console.log` calls per widget render including emoji characters. Should be removed or gated behind a `DEBUG` flag.

9. **RadialProgress console.log spam** (`components/vis/RadialProgress.tsx`, lines 78–99): Same issue as KpiTrend.

### Severity: Low

10. **PeopleGridWidget ResizeObserver stale closure** (`components/vis/PeopleGridWidget.tsx`, lines 75–88): Each observer uses the stale `dims.w` / `dims.h` from closure — concurrent resize events for width then height could use stale counterpart value.

11. **HeatMap CSS transition on SVG rect** (`components/vis/PerformanceHeatMap.tsx`, line 304): `style.transition = 'all 0.2s ease'` on an SVG rect. SVG stroke/fill transitions via CSS are not spec-compliant in all browsers; use D3 `.transition()`.

12. **HeatMap random gradient ID on every render** (`components/vis/PerformanceHeatMap.tsx`, line 431): `Math.random()` in render body rather than `useMemo` means gradient IDs change on every state update, causing SVG defs to accumulate if the SVG is not fully cleared. (The `svg.selectAll('*').remove()` at the start of the effect clears this, so it works, but it is fragile if that line were ever removed.)

---

## UX Gaps

### No Live Preview in Widget Config
The configure-then-save flow is the biggest usability gap. Users spend 30 seconds filling in a form, save, then discover the widget shows an empty state because a metric code has no data. Flourish shows a real-time preview pane alongside the config form.

### Fixed 500px Carousel Height
`VisualCarousel.tsx` line 325: `h-[500px]`. The waterfall with 20 bars is cramped (rotated labels overlap). The radial progress widget with one ring has 400px of empty space below it. Widget height should be configurable or derived from widget type.

### No Print / PDF Export
Foundation executives need to export impact visualizations to PDF for board packets. There is a `board-report` API route (`app/api/portfolio/[id]/board-report/route.ts`) but no corresponding export button in the UI. None of the individual widgets have a "download as PNG/SVG" option. Competing tools (Flourish, Tableau) have one-click export.

### Drag-to-Any-Position is Broken
`EditWidgetsModal` drag-drop fires `reorderWidgets(widgetA, widgetB)` which only swaps two positions — intermediate items do not shift. Dragging item 1 to slot 5 results in item 5 moving to slot 1 and items 2–4 staying put (not what the user expects from drag-to-reorder UX).

### No Widget Resize / Layout Grid
Widgets are displayed one at a time in a carousel. There is no way to show two widgets side by side (e.g., a KPI trend next to a radial progress). Power users will want a 2×2 grid layout for a board dashboard view. Tableau and Power BI both support freeform canvas layouts.

### No Annotation Layer
No way to add text callouts ("Q3 2024 — major grant deployed"), highlight a date range, or attach a comment to a data point. For board story-telling this is a significant gap.

### Mobile Experience
The carousel works on mobile (touch swipe, dot indicators). However several widgets will be unusable on small screens:
- Performance heat map: cells become too small to read (no mobile fallback)
- Bubble chart: touch events not wired — no way to tap a bubble to navigate
- Comparison table: has a mobile card view — this is the only widget with a proper mobile adaptation

### Accessibility Gaps
- Most SVG charts have `role="img"` and `aria-label` — good baseline.
- But there is no `<title>` or `<desc>` inside the SVG elements providing data context (the `aria-label` on the root gives the chart type, not the data).
- The carousel `aria-live="polite"` region (line 445 `VisualCarousel.tsx`) means screen readers announce every slide change during autoplay — this is noisy. Should be `aria-live="off"` during autoplay and `"polite"` only on manual navigation.

---

## Missing Visualization Types

For a foundation/family office platform competing with Tableau and Blackbaud, the following chart types are conspicuously absent:

1. **Stacked Bar Chart** — Portfolio allocation over multiple time periods side-by-side is the most requested board report chart. Cannot be achieved with any current widget.

2. **Sankey / Flow Diagram** — Shows how dollars flow from donor → foundation → grant → investee → outcome. Extremely compelling for board impact narrative. Flourish's most popular chart type for nonprofits.

3. **Geographic Choropleth Map** — Holdings are already geocoded (there is a geocode API route) but the only map widget is a portfolio map (not in `vis/`). A choropleth showing impact intensity by state/country would be powerful for foundations with geographic focus areas.

4. **Grouped Bar Chart (Benchmark Comparison)** — Compare a holding's metric against sector benchmark or peer portfolio. The `showBenchmark`/`benchmarkValue` in SmallMultiples is a single horizontal line — not a true grouped comparison.

5. **Funnel Chart** — Grant pipeline: applications received → reviewed → approved → deployed → impact achieved. Critical for program officer workflows.

6. **Scatter Plot with Regression Line** — For PRIs (Program-Related Investments), showing financial return vs. impact score with a trend line would differentiate high-quality PRIs.

7. **Rolling Average / Moving Average Toggle** — KpiTrend shows raw values; a 3-month rolling average option would reduce noise for volatile metrics.

8. **IRIS+ / SDG Mapping Widget** — A visual mapper showing which holdings contribute to which UN SDGs or IRIS+ categories. Industry-standard impact framework alignment is expected in any enterprise impact reporting tool.

---

## Performance

### SVG vs Canvas
All widgets use SVG. This is appropriate for the data scales involved (typically 5–50 holdings, 12–24 time periods). Canvas would only be warranted for > 10,000 data points. No concern here.

### Bundle Size
- `d3` is imported as `import * as d3` in every widget that uses it (full library import). This is a significant bundle concern — the full D3 bundle is ~500KB. `HoldingsPieWidget.tsx` correctly imports only `d3-shape`, `d3-scale`, and `d3-scale-chromatic` (subpackages). All other widgets use the full `import * as d3`.
- Next.js tree-shaking can help but D3's module structure makes it unreliable. Switching to explicit subpackage imports (`import { scaleLinear, axisBottom } from 'd3-scale'` etc.) could reduce widget bundle sizes by 60–70%.
- `D3JsonWidget.tsx` uses `await import('d3')` inside `useEffect` (line 39), which defers loading but introduces a promise-based delay on every render cycle.

### Re-render Performance
- `KpiTrend.tsx` re-renders the full D3 chart (clear + redraw) whenever `w`, `h`, `parsed`, or `xDomain` change. The stale closure ResizeObserver means `w` and `h` can change independently, causing two consecutive full redraws on resize.
- All the dedicated API route widgets (`WaterfallChart`, `ImpactBubbleChart`, `PerformanceHeatMap`, etc.) use `cache: 'no-store'` on their fetch calls — data is refetched every time the carousel navigates back to that slide. Adding SWR (already used in `WidgetsSection.tsx` and `EditWidgetsModal.tsx`) with a 60-second TTL would eliminate unnecessary refetches.

### API Efficiency
- `bubble-chart` route: properly batches all metric lookups in a single query (good).
- `heat-map` metrics mode: single batched query (good).
- `waterfall` metric mode: N+1 per holding (bad — see bugs section).
- `timeline` route: fetches 500 events without portfolio filter (bad — see bugs section).
- `metric-comparison` route (used by SmallMultiples): not reviewed in detail but follows the same pattern.

---

## Overall Rating

**6.5 / 10**

The visualization module has genuine strengths — a diverse widget library, good carousel UX, proper accessibility foundations, a real widget CRUD system, and standout implementations in `RadialProgress` and `PeopleGridWidget`. However, it falls short of the competitive bar set by Flourish and Tableau in several critical areas: no live preview in widget config, no print/PDF export, a broken drag-reorder UX, the `waterfall` impact mode showing wrong data, production console.log noise, a critical registry mismatch, and the absence of chart types (Sankey, stacked bar, choropleth) that foundation executives will specifically ask for in board presentations. The data layer is generally well-structured, with the notable exception of the timeline route's unfiltered all-table query. Addressing the top-5 priorities below would move this to a solid 8/10 and make it genuinely competitive for the target buyer.

---

## Priority Fixes (Top 5)

### 1. Fix the Waterfall "Impact" Mode Data Bug
**File:** `app/api/portfolio/[id]/waterfall/route.ts`, lines 89–148  
**Effort:** Small (2–4 hours)

The `impact` mode uses `funds_allocated` — identical to `funding` mode. Replace with actual `metric_facts` data: accept a `metric_code` query parameter in impact mode and aggregate latest metric values per holding. Until fixed, any user who selects "impact mode" sees misleading funding data labeled as impact. This is the single highest-risk item for a board presentation context.

### 2. Fix the Timeline API Events Table Query (Security + Performance)
**File:** `app/api/portfolio/[id]/timeline/route.ts`, line 46  
**Effort:** Small (1–2 hours)

`from('events').select('*')` with no portfolio scope pulls all events for all portfolios. Add a join or subquery to restrict to events whose `investee_id` belongs to a holding in the requested portfolio. This is a data isolation issue — if RLS is not configured on the `events` table, portfolio A can see portfolio B's events.

### 3. Fix Widget Registry Mismatch
**File:** `components/vis/registry.ts`  
**Effort:** Small (1 hour)

Merge the 14-type `REGISTRY` from `VisualCarousel.tsx` into `registry.ts` and have `VisualCarousel` import from there. The current state (two separate registries, 11 types missing from the exported one) will silently break any code that imports `widgetRegistry`.

### 4. Add Live Preview to Widget Config Modal
**File:** `components/vis/CreateWidgetModal.tsx`, `ConfigureWidget` function  
**Effort:** Medium (1–2 days)

Split the configure step into a two-panel layout: config form on the left, live widget preview on the right. Pass the current form state as `config` prop to the appropriate widget component, with `portfolioId` threaded through. This is the single biggest UX improvement for editor adoption — users can see immediately whether their metric code has data and how the chart will look.

### 5. Remove Production Console.log Statements
**Files:** `components/vis/KpiTrend.tsx` (lines 37–49), `components/vis/RadialProgress.tsx` (lines 78–99)  
**Effort:** Trivial (30 minutes)

Remove or gate behind `process.env.NODE_ENV === 'development'` all `console.log`, `console.warn`, `console.error` calls in widget components. These currently fire on every dashboard load for every metric-backed widget, leaking metric codes and API URLs to anyone with DevTools open.
