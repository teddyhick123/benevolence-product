# Benevolence — Full Issue Backlog

Last updated: 2026-05-05 (post-tax-center Sprint B wave 3)
Source: 10 individual module reviews in `docs/module-reviews/`
Scope: All remaining bugs, UX gaps, missing features, security issues, and performance issues across all active modules.

Severity legend: **P0** = production-blocking / data integrity / security · **P1** = significant functional gap · **P2** = UX / quality-of-life · **P3** = nice-to-have / future parity

Resolved in Sprint A (2026-04-30): compliance org_id, compliance state-registrations columns, QB schema/connect/disconnect/role-checks, donor CRM org_id + v_donor_summary view, holdings update-basic + link-charity auth, AI chat rate limiting + viewer write guard, admin import commit + resume/rollback buttons.

Resolved in Sprint B wave 1 (2026-05-01): compliance payout `amount_usd`→`fair_market_value` (C1), 990pf-export same column fixes (C1), acknowledgment `contribution_id`→`contribution_ids` array + bad insert columns removed (C2), acknowledgment PDF `getPublicUrl`→`createSignedUrl` 1h TTL + `org_id` filter fix (C3).

Resolved in Sprint B wave 2 (2026-05-04): charities full column reconciliation (C4/Ch-B1/Ch-B4), removed dead queries for non-existent tables (C5/Ch-B2/Ch-U6), replaced `portfolio_recommendations` with `portfolio_charities` junction table (C6/Ch-B3/Ch-F1/Ch-F2/Ch-F7), donor CRM acknowledgment write (Dr-B1), donor PDF signed URL (Dr-B2/Dr-F4).

Resolved in Sprint B wave 3 (2026-05-05): IRS 990-PF Part XIII payout formula — exempt-use assets, acquisition indebtedness, excise-tax deduction, avg FMV (Cm-B2); filing status enum aligned to DB values, Mark-as-Filed button now shows on `upcoming`/`overdue` (Cm-B3); conservation easement 50% AGI limit + schema category (T-B1/T-F1); Form 8283 Section A/B routing for publicly traded securities (T-B2/T-F2); optimization engine 60% cash AGI bucket (T-B3/T-F3); CPA Collaboration Portal enabled (T-B5/T-F5/T-U4); hardcoded CPA base URL → env var (T-B6/T-F6); removed AGI console.log in production (T-B7); Cache-Control: no-store on all sensitive tax routes (T-B8); QCD limit uses scenario year not current year (T-B9); bunching strategy standard deduction no longer hardcoded (T-B10).

---

## Dashboard

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| D-B1 | Triple holdings fetch: `AllAssetsOverview`, `HoldingsSection`, `HoldingsPieAutoRenderer` all independently hit the same holdings endpoint with different `limit` values — pie chart and table can show inconsistent totals | `components/AllAssetsOverview.tsx`, `components/HoldingsSection.tsx`, `components/vis/VisualCarousel.tsx` |
| D-B2 | KPI delta prop always `undefined` — trend arrows never render despite being wired up | `components/KpiSection.tsx`, `components/KpiCard.tsx` |
| D-B3 | `supabasePublic()` used in GET holdings route — no explicit auth gate before querying | `app/api/portfolio/[id]/holdings/route.ts:14` |
| D-B4 | OpenAI summary card dead if `OPENAI_API_KEY` is absent — `AISummaryCard` shows blank with no fallback | `app/api/portfolio/[id]/summary/route.ts`, `components/AISummaryCard.tsx` |
| D-B5 | `AIAssistantPanel` sends unbounded conversation history to API — will exceed payload limits after ~50 messages | `components/AIAssistantPanel.tsx:136-139` |
| D-B6 | Map route leaks `auth_user_id` in response body | `app/api/portfolio/[id]/map/route.ts:198` |
| D-B7 | Holdings GET route has no explicit auth gate — relies entirely on RLS with no `getUser()` call | `app/api/portfolio/[id]/holdings/route.ts` |
| D-B8 | "No portfolio selected" state shows bare `<div>` with no CTA or guidance for new users | `app/dashboard/page.tsx:60` |

### UX Gaps (P2)

| # | Issue | Location |
|---|-------|----------|
| D-U1 | No date-range / fiscal-year filter — all KPI numbers are lifetime totals | Dashboard KPIs |
| D-U2 | "AI Interface" button label is confusing — links to `/dashboard/letter`, not the AI assistant | `app/dashboard/page.tsx:116-123` |
| D-U3 | Board report API exists (`/api/portfolio/[id]/board-report`) but not surfaced anywhere on dashboard | Dashboard |
| D-U4 | Widget carousel auto-advances every 8 seconds with no per-session pause control | `components/vis/VisualCarousel.tsx` |
| D-U5 | 5% payout gauge absent from dashboard — buried in `/compliance` which is itself broken | Dashboard |
| D-U6 | No multi-entity / multi-portfolio switcher — `api/me` returns a list but only first portfolio is used | Dashboard header |
| D-U7 | KPI `lastUpdated` renders raw ISO timestamp string ("2025-01-15T00:00:00") instead of formatted date | `components/KpiCard.tsx:130` |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| D-F1 | Date-range / fiscal-year filter on all KPI cards |
| D-F2 | Board report CTA from dashboard |
| D-F3 | 5% payout gauge widget (once compliance payout calc is fixed) |
| D-F4 | Fix triple-fetch — consolidate to single SWR-cached holdings call |
| D-F5 | Trend arrows — compute and pass delta prop in KpiSection |
| D-F6 | Multi-portfolio switcher in dashboard header |
| D-F7 | Module gating enforcement — show/hide nav links based on actual `org_has_module()` result |

---

## Holdings

### Security (P0–P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| H-S1 | P1 | `supabasePublic()` (anonymous client, bypasses RLS) used in GET `/api/portfolio/[id]/holdings/` — if RLS has any gap, holdings are readable by unauthenticated requests | `app/api/portfolio/[id]/holdings/route.ts:14` |
| H-S2 | P1 | `deleteFact` server action has no `holding_id` scope guard — can delete facts from any holding by supplying a tampered `fact_id` | `app/dashboard/holdings/[holdingId]/page.tsx:583` |
| H-S3 | P1 | No Zod validation in server actions — `asset_type`, `status`, `funds_allocated` accept any value bypassing enum constraints | `app/dashboard/holdings/[holdingId]/page.tsx` server actions |

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| H-B1 | No holdings list page — `app/dashboard/holdings/page.tsx` does not exist — no entry point to the module | `app/dashboard/holdings/` |
| H-B2 | `asset_type` and `status` fields on detail page are free-text inputs instead of selects constrained to DB enums | Holding detail form |
| H-B3 | Edit forms hidden behind `<details>` that disappear once holding has basic info — no discoverable edit path for populated holdings | Holding detail UI |
| H-B4 | `financial-profile/generate` silently uses OpenAI GPT-4o instead of Claude — requires separate API key, undocumented | `app/api/holdings/[id]/financial-profile/generate/route.ts` |
| H-B5 | `approveAll()` in `ReportUploader` processes staged facts serially with empty catch blocks — silent failures | `components/holdings/ReportUploader.tsx` |
| H-B6 | `ReportUploader`, `CharityLinkSearch` have empty `catch {}` blocks on link/unlink/approve/reject — users can't tell if operations succeeded | `components/holdings/ReportUploader.tsx`, `components/holdings/CharityLinkSearch.tsx` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| H-U1 | No entry point to Holdings module — no list page |
| H-U2 | Grant milestones UI absent — API exists (`milestones/route.ts`) but zero UI on detail page |
| H-U3 | Report due dates have no UI despite `next_report_due` field on `grant_details` |
| H-U4 | Grant period status (active/expired/pipeline) not shown anywhere in UI |
| H-U5 | No bulk edit / bulk status change |
| H-U6 | No sort/filter on any holdings view |
| H-U7 | No holding export to CSV/PDF |
| H-U8 | No back-navigation breadcrumb on holding detail page |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| H-F1 | Holdings list page with search, filter by asset_type/status, sort |
| H-F2 | Grant milestone tracker UI on holding detail |
| H-F3 | Report due date calendar / alerts |
| H-F4 | Grant period status badge |
| H-F5 | Impact KPI trend chart on holding detail |
| H-F6 | Bulk import of holdings from CSV |
| H-F7 | Holding export to PDF / board report inclusion |
| H-F8 | PRIs and MRIs should be allowed to have grant_details (currently blocked by asset_type guard) |

---

## Tax Center

### Bugs (P0–P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| T-B4 | P1 | Short-term vs long-term capital gain distinction absent — all appreciated-asset deductions inflated for assets held <12 months | Tax calculation engine |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| T-U1 | No multi-year carryforward visualization |
| T-U2 | No side-by-side scenario comparison view |
| T-U3 | Form 8283 PDF download not wired to a UI button |
| T-U5 | No "what-if" slider for donation amount adjustments |
| T-U6 | Dashboard layout buries AGI Limit Visualizer below the contribution entry form |
| T-U7 | Carryforward section hidden entirely when zero — no explanation for first-time users |
| T-U8 | No year-end giving deadline indicator |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| T-F4 | Short-term / long-term holding period split in deduction estimates |
| T-F7 | State tax deduction limits (California, NY non-conformity rules) |
| T-F8 | AMT impact estimate |
| T-F9 | OBBB 2026 universal deduction for non-itemizers is implemented but never called |

---

## Compliance

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| Cm-B4 | P1 | `reminder_days` column stores preferences but drives zero behavior — no cron job, Edge Function, or email delivery exists | `db/migrations/0016_compliance.sql` |
| Cm-B5 | P1 | State registrations UI does not render in compliance page — API exists, page doesn't surface it | `app/dashboard/compliance/page.tsx` |
| Cm-B6 | P2 | No "Add Filing" UI despite POST endpoint existing | `app/dashboard/compliance/page.tsx` |
| Cm-B7 | P2 | `GET filing_calendar` query doesn't include overdue items — past-due filings missing from default view | `app/api/org/[orgId]/compliance/filing-calendar/route.ts:26-36` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Cm-U1 | No calendar view of upcoming filings |
| Cm-U2 | No email/in-app reminder system |
| Cm-U3 | State registrations section completely absent from UI |
| Cm-U4 | No exportable payout summary (990-PF export is raw JSON, not preparer-ready) |
| Cm-U5 | No IRS 990-PF Part XIII worksheet view |
| Cm-U6 | No "at-risk" alert when distribution falls below 5% threshold |
| Cm-U7 | Filing status badges unreadable due to enum mismatch (see Cm-B3) |
| Cm-U8 | "Mark as Filed" sends only `status: 'filed'` — no confirmation number, filed-by, or notes captured |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Cm-F1 | IRS Part XIII payout calculation (monthly FMV average, exempt-use exclusion, excise tax deduction) |
| Cm-F2 | State registration tracker with UI |
| Cm-F3 | Nightly cron to auto-mark overdue filings + email reminders |
| Cm-F4 | Filing calendar view (monthly/quarterly) |
| Cm-F5 | Document attachment to filings |
| Cm-F6 | Auto-seed filing calendar on org creation (990-PF May 15, Form 8868 Nov 15) |
| Cm-F7 | Annual filing checklist generator |

---

## QuickBooks

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| QB-B1 | P1 | No duplicate export guard — re-running export for the same year creates duplicate QB journal entries | `app/api/integrations/quickbooks/export/contributions/route.ts`, `app/api/integrations/quickbooks/export/grants/route.ts` |
| QB-B2 | P1 | Grants exported by `total_committed` not disbursed amounts — double-counts multi-year grants on first export | QB grants export route |
| QB-B3 | P1 | `refresh_expires_at` column defined in migration but never read — 101-day refresh token expiry goes undetected; UI can't distinguish "never connected" from "refresh token expired" | `lib/integrations/quickbooks/client.ts` |
| QB-B4 | P1 | Dead `getAuthenticatedQBClient(portfolioId)` export queries by `portfolio_id` which no longer exists in canonical schema — always returns null; any caller using it will silently fail | `lib/integrations/quickbooks/client.ts:143-233` |
| QB-B5 | P2 | `QBConnection` interface declares `org_id: string | null` but DB has `org_id NOT NULL` — false nullability in calling code | `lib/integrations/quickbooks/client.ts:116-117` |
| QB-B6 | P2 | `status/route.ts` reads `connected_at` from DB but column does not exist in `0017_quickbooks.sql` — always returns `null` | `app/api/integrations/quickbooks/status/route.ts:36` |
| QB-B7 | P2 | Hard 2,000-row limit silently truncates large exports with no warning | QB export routes |
| QB-B8 | P2 | 30-day token refresh window is too aggressive — access tokens expire in 1 hour; every request in the last month triggers a refresh | `lib/integrations/quickbooks/client.ts:178,248` |
| QB-B9 | P2 | No mutex for concurrent token refresh — two simultaneous requests can both attempt refresh; Intuit invalidates old token on first use, second may write invalid data | `lib/integrations/quickbooks/client.ts` |

### Security (P1)

| # | Severity | Issue |
|---|----------|-------|
| QB-S1 | P1 | Access tokens and refresh tokens stored as plaintext `TEXT` in Postgres — if DB is compromised all QB tokens are directly readable |
| QB-S2 | P1 | `createAdminClient()` used in QB routes — bypasses all RLS for privileged QB operations |
| QB-S3 | P1 | `org_id` in export/sync routes taken from request body without cross-checking against session org — viewer in multiple orgs could trigger admin actions for another org they belong to |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| QB-F1 | Export deduplication guard (`qb_exported_at` + `qb_journal_entry_id` per contribution) |
| QB-F2 | QB Class / fund dimension support (required under ASC 958 for private foundations) |
| QB-F3 | Encrypt tokens at rest (pgcrypto or Vault) |
| QB-F4 | Disbursed vs committed distinction in grants export |
| QB-F5 | `refresh_expires_at` check with re-auth prompt when refresh token is stale |
| QB-F6 | Remove dead `getAuthenticatedQBClient(portfolioId)` function |
| QB-F7 | Net asset class (restricted / unrestricted) tagging on journal entries |
| QB-F8 | Sync history and conflict resolution UI |
| QB-F9 | Token-expired warning that disables export buttons and prompts reconnect |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| Dr-B3 | P1 | "Add Donor" page doesn't exist — `/dashboard/donors/new` 404s — CRM is read-only for users not using ETL import | `app/dashboard/donors/new/` |
| Dr-B4 | P1 | Non-cash donation acknowledgment template IRS non-compliant — missing property description, date received, no-goods-or-services disclaimer | `app/api/org/[orgId]/acknowledgments/route.ts:173-179` |
| Dr-B5 | P1 | `org_role` returns truthy string for viewers — viewer-role users can access full donor PII (email, phone, address) | `app/api/org/[orgId]/donors/route.ts:17-19` |
| Dr-B6 | P1 | Donor list hardcoded `limit: 100` with no pagination UI — orgs with 200+ donors silently lose records | `app/dashboard/donors/page.tsx:65`, `app/api/org/[orgId]/donors/route.ts:51` |
| Dr-B7 | P2 | `DonorProfileForm` POSTs to `/api/portfolio/${portfolioId}/donor-profile` — route does not exist — always 404 | `components/tax/DonorProfileForm.tsx:62` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Dr-U1 | No "Add Donor" page (see Dr-B3) |
| Dr-U2 | No gift entry UI — no way to record a donation in the app |
| Dr-U3 | No pledge tracking UI despite DB supporting it |
| Dr-U4 | Donor acknowledgment letter generator at `/dashboard/letter` is a portfolio narrative tool — not connected to Donor CRM |
| Dr-U5 | No column sorting on donor list |
| Dr-U6 | No edit capability on donor profile page despite PATCH endpoint existing |
| Dr-U7 | No "Generate Letter" button on donor profile |
| Dr-U8 | No standalone acknowledgment queue page for development officers |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Dr-F1 | Add Donor page with full form validation |
| Dr-F2 | Gift entry form (cash, non-cash, securities) |
| Dr-F3 | Fix non-cash acknowledgment template for IRS compliance |
| Dr-F5 | Real pagination — API must return total count with `{ count: 'exact' }` |
| Dr-F6 | Pledge tracking + installment schedule UI |
| Dr-F7 | Household / relationship grouping |
| Dr-F8 | LYBUNT / SYBUNT queries and segmentation |
| Dr-F9 | Year-end letter batch generation |
| Dr-F10 | Soft credit attribution |

---

## Charities

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| Ch-B5 | P1 | Autocomplete endpoint exists but never called from search input — no autocomplete in UI | `app/api/charities/search/autocomplete/route.ts` |
| Ch-B6 | P1 | Two Charity Navigator clients with different auth headers (`Subscription-Key` vs `Authorization: Bearer`) — one always 401 | `lib/services/charity-navigator.ts:74`, `lib/services/charity-ratings.ts:110` |
| Ch-B7 | P1 | "My Portfolio" mode fetches `/api/portfolios` — no non-admin route exists for this path | `app/charities/page.tsx:70` |
| Ch-B8 | P2 | No debouncing on search input — every keystroke fires against 2M-row table | Charity search component |
| Ch-B9 | P2 | Pagination broken for pages 4+ — only shows `[1][2][3]...[last]` with no current-page window | `app/charities/page.tsx:323` |
| Ch-B10 | P2 | No rate limiting on `/api/charities` or `/api/charities/[ein]` — 2M-row table with no throttling | Charity routes |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Ch-U1 | No side-by-side charity comparison view |
| Ch-U2 | No watchlist / saved charities (add-to-portfolio is too heavyweight for early-stage research) |
| Ch-U3 | No diligence notes — no way to record why a charity was chosen or rejected |
| Ch-U4 | Autocomplete not wired to search input (see Ch-B5) |
| Ch-U5 | Pagination broken beyond page 3 (see Ch-B9) |
| Ch-U7 | Mission statement shown only on CSS hover — not accessible on touch devices |
| Ch-U8 | No "similar charities" / related discovery |
| Ch-U9 | No map view despite `latitude`/`longitude` being indexed |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| Ch-F3 | Wire autocomplete to search input with 300ms debounce |
| Ch-F4 | Side-by-side charity comparison view |
| Ch-F5 | Watchlist / save for later |
| Ch-F6 | Diligence notes + decision log |
| Ch-F8 | Multi-year financial trend from ProPublica filings |
| Ch-F9 | Form 990 PDF links from ProPublica |

---

## AI Assistant (Ben)

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| AI-B1 | P1 | `list_holdings` defaults `status` to `'Active'` when not provided — "list all holdings" silently misses Exited and Pipeline holdings | `lib/claude-assistant.ts` — `list_holdings` tool |
| AI-B2 | P1 | `update_holding` and `delete_holding` don't verify the holding belongs to the current portfolio — service-role client bypasses RLS | `lib/claude-assistant.ts`, `lib/ai-action-executor.ts` |
| AI-B3 | P1 | `update_holding` accepts `Record<string,any>` changes with no allowlist — could overwrite `portfolio_id`, `created_at`, or other internal fields | `lib/ai-action-executor.ts:100-106` |
| AI-B4 | P1 | Single-level tool execution loop — nested tool use blocks in final response are silently ignored; complex multi-step requests produce incomplete responses | `lib/claude-assistant.ts:620-694` |
| AI-B5 | P1 | Letter generation uses OpenAI GPT-4o not Claude — requires separate `OPENAI_API_KEY`, creates inconsistent experience | `app/api/portfolio/[id]/letter/generate/route.ts:193` |
| AI-B6 | P1 | `display_widget` records a `create` action for a display-only operation — pollutes undo history with non-mutating events | `lib/claude-assistant.ts:1151-1172` |
| AI-B7 | P2 | Error messages in production may leak internal details (table names, SQL fragments) from Supabase/SDK errors | `app/api/ai/chat/route.ts:242-248` |
| AI-B8 | P2 | No AI usage logging — no table recording token consumption, model calls, or estimated cost per user/org/session | Platform-wide |

### Trust & Safety (P1)

| # | Severity | Issue |
|---|----------|-------|
| AI-S1 | P1 | `update_holding` has no field allowlist — arbitrary column overwrite possible via chat |
| AI-S2 | P1 | No audit trail attribute distinguishing AI-initiated changes from user edits in `ai_actions` |
| AI-S3 | P1 | Service-role Supabase client used for all AI tool execution — bypasses all RLS |
| AI-S4 | P2 | No prompt injection guard on user-provided text that becomes part of AI system prompt context |
| AI-S5 | P2 | Unbounded conversation history — content from early messages can influence later tool calls |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| AI-U1 | No streaming — full reply waits until complete (20–45s for complex reports) before rendering |
| AI-U2 | Conversation history lost on page reload — no persistence across sessions |
| AI-U3 | Suggested prompts are generic — not portfolio-aware or contextual |
| AI-U4 | "Save to Dashboard" for preview widgets has no save button in the chat panel |
| AI-U5 | No indication when Ben is calling a tool vs generating text |
| AI-U6 | No way to cancel a running request |
| AI-U7 | `AIAssistantButton` opens from any dashboard page but Ben has no awareness of which page the user is on |

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
| AI-F1 | Allowlist enforcement on `update_holding` fields |
| AI-F2 | Streaming responses (SSE or ReadableStream) |
| AI-F3 | Persist conversation history across page reloads |
| AI-F4 | Portfolio-aware contextual suggested prompts |
| AI-F5 | Donor CRM tool coverage (`find_donor`, `log_gift`, `generate_acknowledgment`) |
| AI-F6 | Tax center tool coverage (`estimate_deduction`, `run_optimization`) |
| AI-F7 | Multi-turn tool execution loop (while stop_reason !== 'end_turn') |
| AI-F8 | Per-org AI usage tracking for billing and abuse detection |

---

## Visualizations / Widgets

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| Vis-B1 | Waterfall "impact" mode uses `funds_allocated` — identical to "funding" mode — produces misleading board presentations showing funding data labeled as impact | `app/api/portfolio/[id]/waterfall/route.ts:89-148` |
| Vis-B2 | Timeline API events query has no `portfolio_id` filter — `from('events').select('*')` returns all events across all orgs — data isolation issue + performance | `app/api/portfolio/[id]/timeline/route.ts:46` |
| Vis-B3 | Widget type registry (`components/vis/registry.ts`) exports only 3 types; carousel runtime supports 14 — any code importing the registry misses 11 types | `components/vis/registry.ts` |
| Vis-B4 | Drag-to-reorder in `EditWidgetsModal` only swaps two positions — dragging item 1 to slot 5 moves item 5 to slot 1, items 2–4 don't shift | `components/vis/EditWidgetsModal.tsx` |
| Vis-B5 | `ImpactBubbleChart` tooltip uses `event.pageX`/`event.pageY` (absolute) but tooltip is `position: absolute` inside container — tooltip appears offset on any scrolled page | `components/vis/ImpactBubbleChart.tsx:351-353` |
| Vis-B6 | `ImpactTimeline` horizontal mode has no ResizeObserver — SVG width set once on mount, breaks on window resize | `components/vis/ImpactTimeline.tsx:250` |
| Vis-B7 | N+1 query in waterfall `metric` mode — one sequential DB query per holding | `app/api/portfolio/[id]/waterfall/route.ts:196-217` |
| Vis-B8 | `KpiTrend` production `console.log` spam — 3–4 logs per widget render including emoji characters, leaks metric codes to browser console | `components/vis/KpiTrend.tsx:37-49` |
| Vis-B9 | `RadialProgress` production `console.log` spam — same issue | `components/vis/RadialProgress.tsx:78-99` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Vis-U1 | No print/export to PDF for board reports — `board-report` API exists but no button in UI |
| Vis-U2 | Drag-to-reorder non-functional (see Vis-B4) |
| Vis-U3 | Fixed 500px carousel height — waterfall cramped, radial progress wastes space |
| Vis-U4 | No live preview inside widget config form — configure-then-save with no feedback |
| Vis-U5 | Waterfall impact mode misleading (see Vis-B1) |
| Vis-U6 | No inter-slide data cache — navigating carousel re-fetches API on every slide transition |

### Missing Chart Types (P3)

| # | Chart |
|---|-------|
| Vis-F1 | Sankey diagram (fund flow: funder → portfolio → grantee) |
| Vis-F2 | Stacked bar chart |
| Vis-F3 | Choropleth / geographic impact map |
| Vis-F4 | Scatter plot (e.g. ESG score vs financial return) |
| Vis-F5 | Waterfall with true outcomes data (not funding as proxy) |
| Vis-F6 | Print / PDF-optimized widget stylesheet |

---

## Admin / Import

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| Adm-B1 | P1 | AI mapping assist always sends `sample_records: []` — AI never sees actual CSV values, only column names — degrades mapping accuracy for ambiguous fields | `app/admin/imports/[id]/mapping/MappingPageClient.tsx:93` |
| Adm-B2 | P1 | Rollback has hard `.limit(5000)` audit log cap — silently leaves production data behind on imports > 5,000 rows | `lib/import/rollback.ts:83` |
| Adm-B3 | P1 | Three different admin authorization patterns across 25+ routes (Pattern A: `admins` table lookup; Pattern B: `is_admin` RPC; Pattern C: `is_super_admin` profile flag) — inconsistent, may diverge | All admin routes |
| Adm-B4 | P2 | AI fix suggestion ("Apply Fix" per row in error browser) shows a `proposed_value` with confidence but no Accept button — workflow for accepting a suggestion is unclear | `components/admin/ImportErrorsTable.tsx` |
| Adm-B5 | P2 | Staging tables hold donor PII indefinitely — no TTL, cleanup job, or documented data retention policy | `staging_import_*` tables |
| Adm-B6 | P2 | `blackbaud_api` and `direct_db` source types declared in schema but never implemented — always requires CSV export | `lib/import/job-queue.ts` |

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Adm-U1 | AI field mapping never receives sample data — low-quality suggestions (see Adm-B1) |
| Adm-U2 | No progress bar or row-count update during commit |
| Adm-U3 | No post-import validation report (how many rows written, warnings, duplicates) |
| Adm-U4 | No audit log viewer in UI |
| Adm-U5 | No PII retention / cleanup controls |
| Adm-U6 | No download template / sample CSV link before upload |

### Missing Blackbaud Entity Coverage (P2)

| # | Entity Type |
|---|-------------|
| Adm-F1 | Campaigns |
| Adm-F2 | Appeals |
| Adm-F3 | Soft credits |
| Adm-F4 | Pledges and installments |
| Adm-F5 | Event registrations |
| Adm-F6 | Constituent relationships |
| Adm-F7 | Tribute / memorial gifts |
| Adm-F8 | Recurring gift schedules |

---

## Cross-Cutting Issues

| # | Severity | Issue |
|---|----------|-------|
| X1 | P1 | Module gating is cosmetic — nav links and pages don't check `org_has_module()` — Tax, Compliance, Donors always visible regardless of enabled modules |
| X2 | P1 | Multi-entity UX is "first org/first portfolio wins" throughout — `/api/me` picks first portfolio; donors and compliance fetch first org; family offices managing multiple entities are not served |
| X3 | P1 | `family_office` org type missing from onboarding flow — stated target persona cannot self-onboard as the correct type |
| X4 | P1 | Letter generator (`/dashboard/letter`) named and placed misleadingly — it generates portfolio narrative letters, not donor acknowledgments — creates user confusion |
| X5 | P2 | Three inconsistent admin authorization patterns across routes (see Adm-B3) |
| X6 | P2 | No task / workflow / approval system — `reminder_days` and notification preferences exist in schema but drive zero behavior |
| X7 | P2 | No grant lifecycle management (intake → review → approval → payment → reporting → closeout) |
| X8 | P3 | No board portal — no structured quarterly reporting pathway for foundations |

---

## Missing Modules (New Build)

| Priority | Module | Rationale |
|----------|--------|-----------|
| P0 | Grant Lifecycle Management | Largest competitive gap; Foundant/Fluxx built around this |
| P0 | Task / Workflow / Approvals | Required for team-based operations |
| P1 | Board Portal & Reporting | Foundations present to boards quarterly |
| P1 | Document Hub / Data Room | Grant agreements, 990s, appraisals need organized storage |
| P2 | Stakeholder CRM | Grantees, board members, advisors beyond donor CRM |
| P2 | Integration Hub | Salesforce, custodians, banking, data warehouse |
| P3 | External Portals | Grantee-facing application / reporting portal, CPA portal |

---

## Issue Count Summary

| Module | P0 | P1 | P2 | P3 | Total |
|--------|----|----|----|----|-------|
| Dashboard | — | 8 | 7 | — | 15 |
| Holdings | — | 9 | 8 | — | 17 |
| Tax Center | — | 1 | 7 | — | 8 |
| Compliance | — | 2 | 10 | — | 12 |
| QuickBooks | — | 7 | 5 | — | 12 |
| Donor CRM | — | 4 | 9 | — | 13 |
| Charities | — | 3 | 11 | — | 14 |
| AI Assistant | — | 9 | 11 | — | 20 |
| Visualizations | — | 9 | 6 | — | 15 |
| Admin / Import | — | 3 | 9 | — | 12 |
| Cross-Cutting | — | 4 | 3 | 1 | 8 |
| **Total** | **—** | **59** | **86** | **1** | **146** |
