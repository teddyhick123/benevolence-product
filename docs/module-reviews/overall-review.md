# Dashboard / Portfolio Overview — Module Review

Reviewed: 2026-04-26  
Reviewer: Senior Product Engineer (automated)  
Scope: `app/dashboard/page.tsx`, all components consumed by that page, and the API routes they call.

---
Key Findings

High: the module system is broader in the data model than in the product surface. The database defines portfolio, donors, tax, compliance, quickbooks, import, reports, and ai_assistant, but onboarding and settings only let operators manage four of them. That breaks the “module-based platform” story because a large part of the platform is not actually configurable by customers. See 0022_module_enforcement.sql (line 12), ModulesTab.tsx (line 6), and SetupClient.tsx (line 14).

High: module disablement is not consistently enforced. Tax is always visible in nav, middleware only checks auth, and the tax page itself does not check whether the module is enabled. Today module toggles look more like cosmetic preferences than true entitlement/configuration boundaries. See Header.tsx (line 137), middleware.ts (line 27), and tax/page.tsx (line 37).

High: family offices are a stated target, but the primary onboarding flow does not let a user choose family_office, even though the product already contains family-office-specific defaults and labels. That is a market-level mismatch, not just a UX bug. See SetupClient.tsx (line 22), SetupClient.tsx (line 30), and OrganizationTab.tsx (line 12).

High: the “My Portfolio” mode in Charity Discovery appears broken. The page fetches /api/portfolios, but there is no non-admin route for that path in the app. Users will likely never get a default portfolio loaded there. See charities/page.tsx (line 70) and admin portfolios route (line 1).

Medium: the Donors module’s primary CTA points to a route that does not exist. + Add Donor links to /dashboard/donors/new, but there is no corresponding page file. That makes the module feel unfinished at the first important action. See donors/page.tsx (line 93).

Medium: the audit/notification model promises more than the core org update path delivers. The UI expects module_changed and org_updated style events, but the main org PATCH route updates organizations directly without writing audit entries. That will make governance features feel unreliable. See org route (line 37), AuditLogTab.tsx (line 6), and NotificationsTab.tsx (line 15).

Medium: multi-entity UX is still too “first org / first portfolio wins” for a platform aimed at family offices and sophisticated foundations. /api/me picks the first portfolio; donors and compliance fetch the first org; the dashboard falls back to a recommended first portfolio. That will feel cramped as soon as one customer manages multiple funds or entities. See me route (line 59), dashboard/page.tsx (line 51), donors/page.tsx (line 40), and compliance/page.tsx (line 45).

Module Review

Dashboard: strongest module today. The visual layer, map, and embedded AI are genuinely differentiated. It still needs a real executive operating layer: fiscal/date controls, alerts, payout status, multi-portfolio switching, and a surfaced board-report action. The existing dashboard review (line 1) is directionally right.

Tax Center: ambitious and potentially category-leading. It goes beyond “export data” into planning and optimization. The gap is workflow maturity: accountant collaboration, source-of-truth visibility, filing readiness, and a tighter bridge from scenario analysis to concrete actions.

Donors: solid base table, but not yet a true donor CRM. It needs gift entry, households, task management, segmentation, acknowledgment queues, and relationship timelines before it feels like a replacement system.

Compliance: strategically important but currently thin. The filing calendar and payout analysis are useful starts; what’s missing is ownership, reminders, document evidence, state-by-state workflows, and an always-visible compliance posture.

Charity Discovery: promising dataset and filters. It needs compare flows, diligence notes, shortlist management, decision logs, and better connection to grantmaking and donor workflows.

Importer / Migration Copilot: one of the most compelling parts of the platform. This is probably the closest thing to a wedge product. The next step is making it feel like an implementation workspace rather than an admin utility.

Integrations / QuickBooks: currently connection-oriented, not operations-oriented. You need sync health, retry controls, mapping visibility, scheduled syncs, and reconciliation views before finance teams will trust it.

Settings / Ops Hub: good foundation. It still needs org switching, stronger governance, complete audit coverage, real notification delivery, and enterprise identity/admin controls.

Builder: very high upside. It is exactly the sort of thing that could make Benevolence feel like a new category. It needs very strong guardrails, approval UX, proposal diffs, and customer-safe language so it reads as trustworthy rather than experimental.

Letters / Reports: there is real value here, but the IA is muddy. “AI Interface” currently points to the letter experience, while board reports exist separately. These should become a coherent reporting/communications surface.

What’s Missing

The biggest missing product layer is grant lifecycle / program operations: intake, review, diligence, approvals, payments, reporting, renewals, and closeout.
The second is workflow orchestration: tasks, approvals, assignments, reminders, SLAs, and recurring operational checklists.
The third is entity and relationship management beyond donors: grantees, board members, advisors, co-funders, consultants, and service providers.
Other Modules To Add

Grantmaking / Program Management
Board Portal & Reporting
Workflow / Tasks / Approvals
Document Hub / Data Room
Stakeholder CRM for grantees, board, advisors, and partners
Security & Identity for SSO, permissions, retention, and audit administration
Integration Hub for Salesforce, Blackbaud, custodians, banking, and data warehouse sync
External Collaboration Portals for grantees, CPAs, and implementation partners
This review is based on the current code and docs; I didn’t run the app interactively in this pass. The strongest strategic takeaway is that Benevolence already has the beginnings of a real platform, but the module model, entity model, and ops workflows need to become much more coherent if you want it to feel enterprise-grade for foundations and family offices.

## Competitive Assessment

### What Benevolence does well (ahead of field)
- **AI assistant embedded in the dashboard** — the floating "Ben" panel with voice input and structured chart responses is well ahead of Blackbaud RE NXT and Foundant GLM, which have no in-product AI.
- **D3 widget carousel with 13 chart types** — more visual flexibility than Aplos (basic charts) or Fluxx (none). The `VisualCarousel` autoplay, touch swipe, and keyboard nav are solid.
- **Multi-layer map** — holdings geocoded from the holdings table PLUS `holding_locations`, with popover KPIs and asset-type color encoding. Foundant and Blackbaud have no map.
- **KPI tracking against targets with per-portfolio display names** — the `portfolio_metric_targets` overlay on the `v_portfolio_kpi_latest` view is a clean design.
- **Asset-type tab drill-down** (investments / grants / donations) with separate summary cards — better visual hierarchy than Blackbaud's flat grid.

### Competitive gaps vs. Blackbaud RE NXT / Foundant GLM
1. **No date-range filter on the dashboard.** Blackbaud always shows "as of" pickers at the portfolio level. The dashboard here has no fiscal-year selector, so all numbers are "lifetime totals" with no way to scope to a reporting period. Foundation executives need quarterly and YTD views.
2. **No portfolio-level payout-rate gauge.** Private foundations must distribute ≥5 % of assets. Foundant and Blackbaud surface this as a top-line compliance indicator on the dashboard. It exists buried in `/dashboard/compliance` here, but is absent from the main overview.
3. **No trend arrows / period-over-period delta on KPI cards.** The `KpiCard` component has a `delta` prop and renders it correctly, but `KpiSection` never computes or passes a delta value — the prop is always `undefined`. Blackbaud RE NXT shows YoY change on every metric.
4. **Widget carousel auto-advances every 8 seconds even when content is being read.** Blackbaud and Foundant use static grids. For board-member users who may be slower readers, the auto-advance is frustrating and offers no per-session "pause" control that persists.
5. **No board-report / PDF export** from the dashboard. Blackbaud has one-click "Export for Board Meeting." The API route `/api/portfolio/[id]/board-report/route.ts` exists but is not surfaced anywhere on the dashboard.
6. **No notification center.** Blackbaud prominently shows overdue milestones and compliance deadlines. Benevolence has a `FilingCalendarEntry` model but nothing on the dashboard alerts.
7. **"AI Interface" CTA button label is confusing.** The top-right button says "AI Interface" and links to `/dashboard/letter` (the letter generator). This mislabel will confuse foundation staff.
8. **No multi-portfolio switcher.** `api/me` returns multiple portfolios but the dashboard hard-codes the first. Blackbaud supports multi-entity views. A family office managing 3 foundations has no way to switch without changing the URL.

---

## Bugs & Reliability Issues

### B1. Holdings route uses `supabasePublic` (RLS client) but skips explicit auth check on GET
**File:** `app/api/portfolio/[id]/holdings/route.ts:14`  
`const sb = await supabasePublic();` — this resolves to `createServerClient` which is the RLS-enforced client. The GET handler does not call `supabase.auth.getUser()` or `can_edit_portfolio` before querying. This relies entirely on RLS. If a portfolio's RLS policy has any gap, holdings are readable by unauthenticated requests. The POST handler gates correctly with `can_edit_portfolio`, but GET does not fail gracefully with a 401 — it would just return an empty array (or worse, data) when RLS is misconfigured.

### B2. `AllAssetsOverview` fires a full holdings fetch (`limit=1000`) independent of the one already fired by `HoldingsSection` (`limit=100`)
**Files:** `components/AllAssetsOverview.tsx:50`, `components/HoldingsSection.tsx:18`  
On every dashboard load, the same holdings endpoint is called twice. The first is capped at 100 records; the second cap is 1000. They share no SWR cache key because the URLs differ (`?limit=100` vs `?limit=1000`). A portfolio with 200 holdings would display incomplete data in `HoldingsSection` while computing correct pie-chart totals from `AllAssetsOverview` — a silent inconsistency.

### B3. `PortfolioSummarySection` fires three waterfall fetches with no SWR, no caching, no error recovery per tab
**File:** `components/PortfolioSummarySection.tsx:42-46`  
Uses raw `useEffect` + `fetch` instead of SWR. If one of the three parallel fetches rejects, the `catch` block at line 82 only logs to console and the component silently shows no data for that tab — with no user-visible error message. There is no retry logic.

### B4. `KpiSection` in `portfolio-sum` mode renders `canEdit={false}` unconditionally, silently ignoring the `canEdit` prop
**File:** `components/KpiSection.tsx:123`  
When `usePortfolioSums` is true (the default dashboard path), `KpiCarousel` is called with `canEdit={false}`. Even owners see no "Add KPI" button in this mode. The `canEdit` prop is accepted but discarded.

### B5. `AIAssistantPanel` sends the full conversation history on every message with no truncation
**File:** `components/AIAssistantPanel.tsx:136-139`  
```ts
conversationHistory: messages.map((m) => ({ role: m.role, content: m.content })),
```
A long session sends unbounded history to the API. After ~50 messages, request bodies will exceed typical serverless payload limits (~4 MB on Vercel) and the fetch will fail. There is no truncation, sliding window, or session-ID-based resumption.

### B6. Map route leaks `auth_user_id` in the response body to any authenticated caller
**File:** `app/api/portfolio/[id]/map/route.ts:198`  
```ts
auth_user_id: authUserId,
```
This field exposes the Supabase user UUID of the requesting user to every client that renders the map. While not a severe OWASP vulnerability, user UUIDs should not be echoed in API responses; they can be used in enumeration attacks.

### B7. `summary/route.ts` calls OpenAI but is labeled as an AI feature — yet the product stack uses Claude (Anthropic)
**File:** `app/api/portfolio/[id]/summary/route.ts:10,63`  
The `AISummaryCard` embedded in `AllAssetsOverview` calls this route, which conditionally fires only if `OPENAI_API_KEY` is set. The rest of the product uses `@anthropic-ai/sdk`. This is a dead/legacy endpoint — if `OPENAI_API_KEY` is not set in production (likely given the Claude-first stack), `AISummaryCard` shows a stub message and the "Summary" section is empty with no explanation to the user.

### B8. `getBaseUrl()` comment says "await removed" but the code still awaits
**File:** `app/dashboard/page.tsx:34`  
```ts
const h = await headers(); // <-- await removed
```
The comment is wrong — `await` is present. This is a harmless documentation bug but signals stale code cleanup debt.

### B9. `HoldingsSection` hard-codes `limit=100` but never shows a "load more" or pagination control
**File:** `components/HoldingsSection.tsx:18`  
A portfolio with >100 holdings silently truncates. No user-visible indicator of truncation. `nextOffset` is returned in the API response but is never read by this component.

### B10. `EditKpiModal` uses `confirm()` for delete confirmation
**File:** `components/EditKpiModal.tsx:159`  
```ts
if (!confirm('Delete this KPI? This cannot be undone.')) return;
```
`window.confirm` is blocked in cross-origin iframes and is visually inconsistent with the rest of the design system. It will also fail in React strict mode concurrent rendering environments.

---

## UX Gaps

### U1. Dashboard loads with no skeleton for `PortfolioSummarySection`
**File:** `components/PortfolioSummarySection.tsx:119-134`  
While `loading=true`, the component renders a generic `<div>Loading portfolio overview...</div>` with no height constraint. This causes layout shift when real content appears (a large card with a pie chart). Every other section uses a fixed-height skeleton or a min-height container.

### U2. The "No portfolio selected" fallback is a bare `<div>` with no action
**File:** `app/dashboard/page.tsx:60`  
```tsx
return <div className="p-6">No portfolio selected.</div>;
```
A new user who lands here after sign-up gets a blank page. There is no call-to-action to create a portfolio, link to onboarding, or explain why this happened.

### U3. KPI carousel navigation arrows have no visible label indicating current position
**File:** `components/KpiSection.tsx:240-268`  
The carousel shows left/right arrows and a count badge ("N KPIs") but no indicator of which KPI is currently in view (e.g., "2 of 7"). Users cannot tell their position in the scroll.

### U4. `WidgetsSection` empty state for viewers has no explanation
**File:** `components/vis/WidgetsSection.tsx:57-63`  
When `canEdit=false` and there are no widgets, the user sees "No widgets configured." with no explanation that an editor can add them, or guidance on what widgets are. Viewers (e.g., board members) will be confused.

### U5. `MapSection` shows filter controls before data has loaded
**File:** `components/MapSection.tsx:110-199`  
The filter bar (mode selector + search + asset type pills) is gated on `points.length > 0`, which is only evaluated after the SWR fetch resolves. But when loading, the filter controls are hidden and then pop in — causing a layout shift. The user sees just the loading spinner, then the controls appear above it.

### U6. `AIAssistantPanel` welcome message is always shown regardless of conversation history
**File:** `components/AIAssistantPanel.tsx:73-91`  
The `useEffect` that sets the welcome message fires when `messages.length === 0`. But `loadHistory()` is async and may not have resolved yet when this check runs. The welcome message flashes momentarily on every open, even for users with a long conversation history, because `messages` starts empty.

### U7. `GrantsList` on the dashboard shows all grants in a 500px scrollable box with no sort or filter
**File:** `components/grants/GrantsList.tsx:54`  
Fetches up to 50 grants and dumps them in a max-height scrollable div. There is no sort, no filter by status/date, and no "View all grants" link. For a foundation with 40 active grants this is unusable.

### U8. The dashboard header "AI Interface" button links to the letter generator, not the AI assistant
**File:** `app/dashboard/page.tsx:116-123`  
The button is labeled "AI Interface" but `href="/dashboard/letter"`. The actual AI assistant is the floating FAB. This creates two competing AI entry points with conflicting labels.

### U9. `KpiCard` displays raw ISO timestamp strings for `lastUpdated`
**File:** `components/KpiCard.tsx:130`  
```tsx
<div className="text-xs text-neutral-400">Updated {lastUpdated}</div>
```
`lastUpdated` is passed directly from `k.as_of || k.period_end` which is an ISO 8601 string like `2025-01-15T00:00:00`. No formatting is applied. Board members will see "Updated 2025-01-15T00:00:00" instead of "Updated Jan 15, 2025."

### U10. Hover animations on error states are semantically wrong
**Files:** `components/MapSection.tsx:201,205`  
Error and loading state cards have `hover:-translate-y-0.5 hover:shadow-lg` — the same hover effect as interactive cards. Error messages should not suggest they are clickable.

---

## Missing Features

Foundation staff would expect these on the main dashboard:

1. **Fiscal year / date range selector.** All KPIs and summaries are lifetime or "latest value." No ability to scope to Q1 2025 or FY 2024.
2. **5% payout requirement gauge.** Critical for private foundations. The backend compliance API exists but isn't surfaced on the dashboard.
3. **Overdue milestone / compliance alert banner.** Blackbaud and Foundant both have prominent alert rails. `FilingCalendarEntry` data exists but is not consumed here.
4. **Multi-portfolio switcher.** `api/me` returns a list; only the first portfolio is ever used. Family offices managing multiple foundations cannot switch without URL manipulation.
5. **Period-over-period delta on KPI cards.** The `delta` prop exists on `KpiCard` but is never computed or passed from `KpiSection`.
6. **Board report export button.** The `/api/portfolio/[id]/board-report` route exists but is completely un-surfaced on the dashboard.
7. **Grant pipeline summary.** Foundation program officers need to see grants by stage (proposed / approved / disbursed / closed) at a glance, not just a flat list.
8. **Currency localization.** `AllAssetsOverview` hard-codes `'USD'` (`components/AllAssetsOverview.tsx:165`). The `portfolios` table has a `base_currency` field returned by `api/me` but it is not propagated to the dashboard or any summary card.
9. **"Last refreshed" indicator.** All data is fetched with `cache: 'no-store'` but there is no timestamp telling users when numbers were last updated. Finance staff need to know if they are looking at stale data.
10. **Undo/redo for AI actions is only visible inside the AI panel.** If "Ben" adds or modifies a holding, the only way to undo is to re-open the panel. There should be a toast/notification in the main dashboard with a quick-undo affordance.

---

## Security / Data Integrity

### S1. Holdings GET route has no explicit auth gate
**File:** `app/api/portfolio/[id]/holdings/route.ts:14-37`  
The GET handler calls `supabasePublic()` (the RLS-scoped client) and issues a query without first calling `supabase.auth.getUser()`. If RLS is misconfigured (e.g., a missing policy after a migration), the endpoint returns data to anonymous users. The POST handler correctly gates with `can_edit_portfolio`. The GET handler should at minimum call `getUser()` and return a 401 if there is no session.

### S2. Map route exposes `auth_user_id` in the response
**File:** `app/api/portfolio/[id]/map/route.ts:198`  
Discussed in B6. Remove from the response body.

### S3. `summary/route.ts` (OpenAI) has auth and rate limiting, but `api/ai/chat` is not reviewed here — confirm it has the same rate limit
**File:** `app/api/portfolio/[id]/summary/route.ts:17-22`  
The summary route uses `aiLimiter`. Verify `api/ai/chat` (used by `AIAssistantPanel`) also uses a rate limiter, especially since the panel supports voice input which could trigger many requests in a short session.

### S4. `EditKpiModal` sends `metric_code` as a free-text field; the server validates it exists but only for POST, not PATCH
**File:** `components/EditKpiModal.tsx:127`, `app/api/portfolio/[id]/kpis/route.ts:65-73`  
The POST handler verifies `metric_code` exists in the `metrics` table. The PATCH handler at `/kpis/[metricCode]/route.ts` (not reviewed in full) may not re-validate on update if it uses the URL param directly.

### S5. `AIAssistantPanel` does not sanitize the `data.message` field before passing it to `ReactMarkdown`
**File:** `components/AIAssistantPanel.tsx:151`  
`ReactMarkdown` is generally safe against XSS if no `rehype-raw` plugin is used, but this should be confirmed. If `rehype-raw` is included in the dependency tree and activated by any plugin config, AI-generated content could inject raw HTML.

### S6. `supabasePublic` alias is deprecated but still used in production routes
**Files:** `app/api/portfolio/[id]/holdings/route.ts:2`, `lib/supabase.ts:97`  
The alias points to `createServerClient` which is correct, but the deprecation is a migration risk. New developers reading `supabasePublic` may not realize it is the RLS-enforced client (not an unauthenticated public client), leading to auth-bypass assumptions.

---

## Performance

### P1. Dashboard page makes 5 sequential + parallel network round trips before rendering anything
**File:** `app/dashboard/page.tsx:53-86`  
The page first fetches `/api/me` (sequential, line 53), then fans out to 4 parallel fetches (meta, role, settings, KPI RPC). The `/api/me` call adds a full RTT before any parallel work starts. The `recommended_portfolio_id` could instead be read from the `x-org-id` cookie or a dedicated cookie set at login, eliminating this blocking fetch.

### P2. `AllAssetsOverview` fetches holdings with `limit=1000` on every dashboard render
**File:** `components/AllAssetsOverview.tsx:50`  
This is a client-side fetch in a `useEffect` with no SWR caching. Every time the dashboard is visited (or the tab is refocused, if SWR's `revalidateOnFocus` is on globally), this fires again. For a portfolio with hundreds of holdings, this is a large payload computed purely client-side. This logic belongs in a server-side aggregate (the existing `v_portfolio_kpi_latest` or a dedicated SQL view).

### P3. `PortfolioSummarySection` fires 3 parallel fetches with `useEffect` — no SWR deduplication
**File:** `components/PortfolioSummarySection.tsx:42-46`  
`/performance`, `/grants`, `/donations` are fetched with raw `fetch` inside `useEffect`. If `PortfolioSummarySection` re-renders (e.g., `portfolioId` prop changes, parent re-renders), all three fetches re-fire from scratch. Using SWR would provide deduplication, caching, and revalidation.

### P4. `VisualCarousel` uses `ResizeObserver` and `willChange: 'transform'` on the slide container, which forces a GPU compositing layer for every slide
**File:** `components/vis/VisualCarousel.tsx:437-465`  
`willChange: 'transform'` is set on the outer container and on every individual slide (via Tailwind `will-change-transform`). With 10 widgets this creates 11 compositing layers, increasing GPU memory usage. `willChange` should be set only during the transition and removed after it completes.

### P5. Map route is cached for 1 hour (`s-maxage=3600`) but holdings route is cached for 5 minutes (`s-maxage=300`)
**Files:** `app/api/portfolio/[id]/map/route.ts:221`, `app/api/portfolio/[id]/holdings/route.ts:43`  
A user can add a holding with a geo-coordinate and see it in the Holdings table within 5 minutes, but the map will be stale for up to an hour. The cache header mismatch means the map and table can show different sets of geocoded holdings.

### P6. `HoldingsPieAutoRenderer` in `VisualCarousel` fires its own holdings fetch (`/holdings`) inside the widget, independent of the `HoldingsSection` fetch and the `AllAssetsOverview` fetch
**File:** `components/vis/VisualCarousel.tsx:134-179`  
When all three are on the same dashboard, the same endpoint is called 3 times per page load. There is no shared data layer / store.

### P7. The `KpiSection` always fires a SWR fetch for `/api/portfolio/[id]/kpis` even when `usePortfolioSums=true`
**File:** `components/KpiSection.tsx:30-33`  
```ts
const { data, error, isLoading, mutate } = useSWR<...>(
  `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`,
  fetcher
);
```
The SWR key is always non-null, so the fetch fires regardless of whether `usePortfolioSums` is true. In `portfolio-sum` mode the response is only used to build the `nameByCode` map (for display names). This is wasteful — it incurs a full KPI fetch just for name resolution.

---

## Overall Rating

**5.5 / 10**

The core data model and visual language are competitive — the multi-asset portfolio view with asset-type tabs, the embedded AI assistant with voice input, and the 13-widget D3 carousel are genuine differentiators. However, the dashboard has significant reliability gaps (silent data truncation at 100 holdings, dead OpenAI AI summary, unbounded AI message history), a triple-counted holdings fetch that will be visibly slow at scale, and critical missing features that foundation executives need on day one: date-range scoping, the 5% payout gauge, and period-over-period KPI deltas. The UX also has several friction points — confusing button labels, raw ISO timestamps, a welcome-message flash — that undercut the premium feel the design system is reaching for.

---

## Priority Fixes (Top 5)

1. **Fix the triple holdings fetch and introduce a shared data layer (P2, P6, B2).**  
   `AllAssetsOverview`, `HoldingsSection`, and `HoldingsPieAutoRenderer` all fetch the same endpoint independently with different `limit` values, producing inconsistent displayed totals. Consolidate into a single SWR key (`/api/portfolio/[id]/holdings?limit=200`) shared by all three components, or move the aggregate computation server-side into `v_portfolio_kpi_latest` / a dedicated view. This is also a correctness bug — the pie chart and the table can show different total counts.

2. **Add an explicit auth guard to the holdings GET route (S1).**  
   `app/api/portfolio/[id]/holdings/route.ts` GET handler must call `supabase.auth.getUser()` and return 401 if no session. Relying solely on RLS for access control means a misconfigured policy silently exposes data. All sibling routes (role, kpis, map) do this correctly.

3. **Replace the OpenAI AI summary with the existing Claude stack, or remove the dead path (B7).**  
   `app/api/portfolio/[id]/summary/route.ts` calls OpenAI and is dead in a Claude-only deployment. `AISummaryCard` — embedded in the main portfolio overview card — silently renders nothing. Either migrate the prompt to `@anthropic-ai/sdk` (consistent with the rest of the product) or remove `AISummaryCard` from `AllAssetsOverview` until it is implemented.

4. **Add fiscal-year / date-range scoping to the dashboard (Missing Feature #1).**  
   Without a date-range picker, the dashboard is not usable for quarterly board reporting or year-end audits — the primary use cases for foundation executives. Add a date-range control to the dashboard header that propagates as query params to `KpiSection`, `PortfolioSummarySection`, and the holdings fetch. The backend KPI endpoints already accept date filters via the `v_portfolio_kpi_latest` view.

5. **Truncate AI conversation history before sending and add a 401/rate-limit recovery UI (B5).**  
   `AIAssistantPanel.sendMessage()` sends the full `messages` array with every request. After ~30 exchanges this exceeds reasonable payload sizes. Implement a sliding window (e.g., last 20 messages) or use the `sessionId` to have the server maintain history server-side. Add a visible error state when the API returns 429 (rate limit) rather than the generic "Sorry, I encountered an error" message which gives users no indication they should wait.
