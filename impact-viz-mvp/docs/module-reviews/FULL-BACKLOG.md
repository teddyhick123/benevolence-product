# Benevolence — Full Issue Backlog

Last updated: 2026-05-06 (post-Sprint B wave 11 — AI-S2/S3 session-scoped client + initiated_by audit column)
Source: 10 individual module reviews in `docs/module-reviews/`
Scope: All remaining bugs, UX gaps, missing features, security issues, and performance issues across all active modules.

Severity legend: **P0** = production-blocking / data integrity / security · **P1** = significant functional gap · **P2** = UX / quality-of-life · **P3** = nice-to-have / future parity

Resolved in Sprint A (2026-04-30): compliance org_id, compliance state-registrations columns, QB schema/connect/disconnect/role-checks, donor CRM org_id + v_donor_summary view, holdings update-basic + link-charity auth, AI chat rate limiting + viewer write guard, admin import commit + resume/rollback buttons.

Resolved in Sprint B wave 1 (2026-05-01): compliance payout `amount_usd`→`fair_market_value` (C1), 990pf-export same column fixes (C1), acknowledgment `contribution_id`→`contribution_ids` array + bad insert columns removed (C2), acknowledgment PDF `getPublicUrl`→`createSignedUrl` 1h TTL + `org_id` filter fix (C3).

Resolved in Sprint B wave 2 (2026-05-04): charities full column reconciliation (C4/Ch-B1/Ch-B4), removed dead queries for non-existent tables (C5/Ch-B2/Ch-U6), replaced `portfolio_recommendations` with `portfolio_charities` junction table (C6/Ch-B3/Ch-F1/Ch-F2/Ch-F7), donor CRM acknowledgment write (Dr-B1), donor PDF signed URL (Dr-B2/Dr-F4).

Resolved in Sprint B wave 3 (2026-05-05): IRS 990-PF Part XIII payout formula — exempt-use assets, acquisition indebtedness, excise-tax deduction, avg FMV (Cm-B2); filing status enum aligned to DB values, Mark-as-Filed button now shows on `upcoming`/`overdue` (Cm-B3); conservation easement 50% AGI limit + schema category (T-B1/T-F1); Form 8283 Section A/B routing for publicly traded securities (T-B2/T-F2); optimization engine 60% cash AGI bucket (T-B3/T-F3); CPA Collaboration Portal enabled (T-B5/T-F5/T-U4); hardcoded CPA base URL → env var (T-B6/T-F6); removed AGI console.log in production (T-B7); Cache-Control: no-store on all sensitive tax routes (T-B8); QCD limit uses scenario year not current year (T-B9); bunching strategy standard deduction no longer hardcoded (T-B10); holdings GET auth check + no-store cache header (H-S1); deleteFact holding_id scope guard (H-S2); asset_type/status enum validation in server actions (H-S3).

Resolved in Sprint B wave 11 (2026-05-06): AI-S2 initiated_by column (migration 0029) on ai_actions, set to 'ai' by executor; AI-S3 ClaudePortfolioAssistant now takes session-scoped client — all AI tool calls respect RLS.

Resolved in Sprint B wave 10 (2026-05-06): QB-S1 AES-256-GCM token encryption via token-crypto.ts; QB-S2 createAdminClient replaced with session client in callback/disconnect/sync-accounts (RLS now enforced); QB-S3 verified resolved (export routes already cross-check admin membership); D-B1 consolidated triple holdings fetch to single SWR-cached useHoldings() hook.

Resolved in Sprint B wave 9 (2026-05-06): T-B4 short-term cap gains uses 37% ordinary-income rate + deduction capped at cost basis; H-B3 edit forms no longer hidden once holding has basic fields set.

Resolved in Sprint B wave 8 (2026-05-06): AI-B4 multi-turn tool execution loop — replaced two-pass approach with while-loop (max 5 turns), tool calls in final response are now executed instead of silently dropped; Adm-B3 admin auth consolidated — created lib/admin-auth.ts with canonical requireAdmin() using is_admin() RPC, removed 25 duplicate inline functions that queried admins table directly.

Resolved in Sprint B wave 7 (2026-05-06): Adm-B1 AI mapping now passes up to 5 actual staging rows as sample_records; Adm-B2 rollback replaced .limit(5000) with full paginated fetch; X3 family_office added to onboarding PersonaSelector, org_type values aligned to DB enum across PersonaSelector/QuickIntakeForm/intake Zod schema; X4 dashboard "AI Interface" label renamed to "Portfolio Letter".

Resolved in Sprint B wave 6 (2026-05-05): Ch-B5 autocomplete wired to search input with 300ms debounce and outside-click dismiss; Ch-B6 Charity Navigator client aligned to `Subscription-Key` header at `api.data.charitynavigator.org/v2`; Ch-B7 `fetchDefaultPortfolio` fixed to use `/api/me`; D-B3/D-B7 verified already resolved (explicit `getUser()` auth gate present in holdings GET route).

Resolved in Sprint B wave 5 (2026-05-05): AI-B1 list_holdings status default removed; AI-B2/AI-B3 update/delete holding portfolio ownership + field allowlist; AI-B5 letter/generate switched to Claude; AI-B6 display_widget spurious create action removed; Vis-B2 timeline events filtered by portfolio investee_ids; Vis-B3 InlineWidget + registry.ts register all 14 widget types; Vis-B8/B9 KpiTrend/RadialProgress console.log spam removed; D-B2 KPI delta computed from metric_facts and passed to KpiCard; D-B4 summary route switched to Claude Haiku — no longer requires OPENAI_API_KEY; D-B5 AIAssistantPanel history capped at 20 messages; D-B6 auth_user_id removed from map route response; D-B8 empty portfolio state replaced with CTA; H-B2 asset_type/status changed from free-text inputs to selects with DB enum values; H-B4 financial-profile generate switched to Claude; H-B5/H-B6 ReportUploader/CharityLinkSearch errors now surfaced to user.

---

## Dashboard

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| D-B1 | Triple holdings fetch: `AllAssetsOverview`, `HoldingsSection`, `HoldingsPieAutoRenderer` all independently hit the same holdings endpoint with different `limit` values — pie chart and table can show inconsistent totals | `components/AllAssetsOverview.tsx`, `components/HoldingsSection.tsx`, `components/vis/VisualCarousel.tsx` |
~~| D-B2 | KPI delta prop always `undefined` — trend arrows never render despite being wired up |~~ _(resolved Sprint B wave 5 — delta computed from metric_facts, passed to KpiCard)_
~~| D-B3 | `supabasePublic()` used in GET holdings route — no explicit auth gate before querying |~~ _(verified resolved — explicit `getUser()` + 401 guard present at line 18)_
~~| D-B4 | OpenAI summary card dead if `OPENAI_API_KEY` is absent |~~ _(resolved Sprint B wave 5 — switched to Claude Haiku)_
~~| D-B5 | `AIAssistantPanel` sends unbounded conversation history to API |~~ _(resolved Sprint B wave 5 — capped at 20 messages)_
~~| D-B6 | Map route leaks `auth_user_id` in response body |~~ _(resolved Sprint B wave 5)_
~~| D-B7 | Holdings GET route has no explicit auth gate |~~ _(verified resolved — same as D-B3)_
~~| D-B8 | "No portfolio selected" state shows bare `<div>` with no CTA |~~ _(resolved Sprint B wave 5 — CTA pointing to /onboarding)_

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
~~| D-F5 | Trend arrows — compute and pass delta prop in KpiSection |~~ _(resolved Sprint B wave 5)_
| D-F6 | Multi-portfolio switcher in dashboard header |
| D-F7 | Module gating enforcement — show/hide nav links based on actual `org_has_module()` result |

---

## Holdings

### Security (P0–P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
_(H-S1, H-S2, H-S3 resolved in Sprint B wave 3 — see commit eb13d1c0)_

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
~~| H-B1 | No holdings list page |~~ _(resolved 8c0903e5)_
~~| H-B2 | `asset_type` and `status` free-text inputs instead of selects |~~ _(resolved Sprint B wave 5 — replaced with selects constrained to DB enum values)_
| H-B3 | Edit forms hidden behind `<details>` that disappear once holding has basic info — no discoverable edit path for populated holdings | Holding detail UI |
~~| H-B4 | `financial-profile/generate` uses OpenAI GPT-4o |~~ _(resolved Sprint B wave 5 — switched to Claude claude-sonnet-4-6)_
~~| H-B5 | `approveAll()` silent failures in `ReportUploader` |~~ _(resolved Sprint B wave 5 — errors surfaced to user)_
~~| H-B6 | `ReportUploader`/`CharityLinkSearch` empty catch blocks |~~ _(resolved Sprint B wave 5 — errors surfaced to user)_

### UX Gaps (P2)

| # | Issue |
|---|-------|
~~| H-U1 | No entry point to Holdings module |~~ _(resolved 8c0903e5)_
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
~~| H-F1 | Holdings list page |~~ _(resolved 8c0903e5)_
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
~~| Cm-B4 | reminder_days drives zero behavior |~~ _(resolved 7585333f — visual indicator now shown in UI)_
~~| Cm-B5 | State registrations UI absent |~~ _(resolved 7585333f)_
~~| Cm-B6 | P2 | No "Add Filing" UI despite POST endpoint existing |~~ _(resolved — "+ Add Filing" button in section header reveals inline form with filing_type, title, due_date, jurisdiction, description)_
~~| Cm-B7 | overdue items missing from GET query |~~ _(resolved 7585333f)_

### UX Gaps (P2)

| # | Issue |
|---|-------|
| Cm-U1 | No calendar view of upcoming filings |
| Cm-U2 | No email/in-app reminder system |
~~| Cm-U3 | State registrations absent |~~ _(resolved 7585333f)_
| Cm-U4 | No exportable payout summary (990-PF export is raw JSON, not preparer-ready) |
| Cm-U5 | No IRS 990-PF Part XIII worksheet view |
| Cm-U6 | No "at-risk" alert when distribution falls below 5% threshold |
~~| Cm-U7 | Filing status badge enum mismatch |~~ _(resolved in Cm-B3, Sprint B wave 3)_
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
~~| QB-B1 | duplicate export guard |~~ _(resolved d380d8cc — duplicate DocNumber gracefully skipped)_
~~| QB-B2 | grants exported by total_committed |~~ _(resolved d380d8cc — now uses funds_allocated)_
~~| QB-B3 | refresh_expires_at never read |~~ _(resolved d380d8cc — checked before refresh; status route exposes needs_reconnect)_
~~| QB-B4 | dead getAuthenticatedQBClient |~~ _(resolved d380d8cc — replaced with deprecation stub)_
~~| QB-B5 | org_id nullability |~~ _(resolved d380d8cc — interface fixed)_
~~| QB-B6 | connected_at column missing |~~ _(resolved d380d8cc — status route uses created_at)_
~~| QB-B7 | 2000-row truncation silent |~~ _(resolved d380d8cc — warning returned in response)_
~~| QB-B8 | P2 | 30-day token refresh window too aggressive |~~ _(resolved — refresh window reduced to 5 minutes; access tokens live ~1 hour)_
~~| QB-B9 | P2 | No mutex for concurrent token refresh |~~ _(resolved — in-process `refreshLocks` Map serializes refresh per org; second caller waits then re-reads DB)_

### Security (P1)

| # | Severity | Issue |
|---|----------|-------|
~~| QB-S1 | P1 | Tokens plaintext in Postgres |~~ _(resolved — AES-256-GCM via QB_TOKEN_ENCRYPTION_KEY, isEncrypted() guard for legacy rows)_
~~| QB-S2 | P1 | `createAdminClient()` in QB routes |~~ _(resolved — callback/disconnect/sync-accounts use session client; RLS enforces org scope)_
~~| QB-S3 | P1 | `org_id` from body without session cross-check |~~ _(verified resolved — both export routes check organization_members admin role before acting)_

### Missing Features (P2–P3)

| # | Feature |
|---|---------|
~~| QB-F1 | Export deduplication guard |~~ _(resolved d380d8cc)_
| QB-F2 | QB Class / fund dimension support (required under ASC 958 for private foundations) |
~~| QB-F3 | Encrypt tokens at rest |~~ _(resolved — AES-256-GCM, see QB-S1)_
~~| QB-F4 | Disbursed vs committed distinction in grants export |~~ _(resolved d380d8cc)_
~~| QB-F5 | refresh_expires_at check |~~ _(resolved d380d8cc)_
~~| QB-F6 | Remove dead getAuthenticatedQBClient |~~ _(resolved d380d8cc — deprecated stub)_
| QB-F7 | Net asset class (restricted / unrestricted) tagging on journal entries |
| QB-F8 | Sync history and conflict resolution UI |
| QB-F9 | Token-expired warning that disables export buttons and prompts reconnect |
| QB-F10 | Background job for scheduled sync (`sync_interval_hours` column exists but drives nothing) |

---

## Donor CRM

### Bugs (P1)

| # | Severity | Issue | Location |
|---|----------|-------|----------|
~~| Dr-B3 | Add Donor page missing |~~ _(resolved 8c0903e5)_
~~| Dr-B4 | Non-cash acknowledgment IRS non-compliant |~~ _(resolved 8c0903e5)_
~~| Dr-B5 | viewer role donor PII exposure |~~ _(resolved 8c0903e5)_
~~| Dr-B6 | hardcoded limit 100 |~~ _(resolved 8c0903e5)_
~~| Dr-B7 | P2 | `DonorProfileForm` POSTs to `/api/portfolio/${portfolioId}/donor-profile` — route does not exist — always 404 |~~ _(verified resolved — route exists at `app/api/portfolio/[id]/donor-profile/route.ts`)_

### UX Gaps (P2)

| # | Issue |
|---|-------|
~~| Dr-U1 | No "Add Donor" page |~~ _(resolved 8c0903e5)_
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
~~| Ch-B5 | Autocomplete endpoint never called from search input |~~ _(resolved Sprint B wave 6 — debounced autocomplete dropdown wired to search input)_
~~| Ch-B6 | Two Charity Navigator clients with different auth headers |~~ _(resolved Sprint B wave 6 — `charity-ratings.ts` aligned to `Subscription-Key` at `api.data.charitynavigator.org/v2`)_
~~| Ch-B7 | "My Portfolio" fetches non-existent `/api/portfolios` route |~~ _(resolved Sprint B wave 6 — uses `/api/me` + `recommended_portfolio_id`)_
~~| Ch-B8 | P2 | No debouncing on search input |~~ _(resolved — `debouncedQuery` state (300ms) gates the main charity fetch; keystrokes only update local state)_
~~| Ch-B9 | P2 | Pagination broken for pages 4+ |~~ _(resolved — sliding window ±2 around current page with leading/trailing ellipsis and always-visible first/last)_
~~| Ch-B10 | P2 | No rate limiting on `/api/charities` or `/api/charities/[ein]` |~~ _(resolved — `charitiesLimiter` (120 req/min per IP, sliding window) applied to both routes; graceful skip when Redis not configured)_

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
~~| AI-B1 | list_holdings status default |~~ _(resolved Sprint B wave 5 — status filter only applied when explicitly provided)_
~~| AI-B2 | update/delete holding portfolio ownership unverified |~~ _(resolved Sprint B wave 5 — portfolio_id scope guard added to both queries)_
~~| AI-B3 | update_holding no field allowlist |~~ _(resolved Sprint B wave 5 — allowlist of 27 safe columns enforced)_
~~| AI-B4 | Single-level tool execution loop |~~ _(resolved Sprint B wave 8 — multi-turn loop, max 5 turns)_
~~| AI-B5 | Letter generation uses OpenAI GPT-4o |~~ _(resolved Sprint B wave 5 — switched to claude-sonnet-4-6)_
~~| AI-B6 | display_widget records spurious create action |~~ _(resolved Sprint B wave 5 — no action recorded for display-only op)_
~~| AI-B7 | P2 | Error messages may leak internal details in production |~~ _(resolved — production returns generic message; full error logged server-side and exposed only in dev)_
~~| AI-B8 | P2 | No AI usage logging |~~ _(resolved — migration 0030 adds `ai_usage_log` table; Anthropic provider surfaces per-turn usage; claude-assistant accumulates across multi-turn; chat route logs input/output tokens + model fire-and-forget)_

### Trust & Safety (P1)

| # | Severity | Issue |
|---|----------|-------|
~~| AI-S1 | `update_holding` has no field allowlist |~~ _(resolved Sprint B wave 5 — see AI-B3)_
~~| AI-S2 | P1 | No audit trail attribute |~~ _(resolved — migration 0029 adds initiated_by column with 'ai' default; ai-action-executor sets it on every insert)_
~~| AI-S3 | P1 | Service-role client for AI tools |~~ _(resolved — ClaudePortfolioAssistant now accepts session client; chat route passes user supabase; all tool calls run through RLS)_
~~| AI-S4 | P2 | No prompt injection guard |~~ _(resolved — `lib/ai/prompt-guard.ts` pattern-matches injection attempts; chat route rejects with 400 before message reaches Claude)_
~~| AI-S5 | Unbounded conversation history |~~ _(resolved Sprint B wave 5 — D-B5 history capped at 20 messages)_

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
~~| AI-F1 | Allowlist enforcement on `update_holding` fields |~~ _(resolved Sprint B wave 5)_
| AI-F2 | Streaming responses (SSE or ReadableStream) |
| AI-F3 | Persist conversation history across page reloads |
| AI-F4 | Portfolio-aware contextual suggested prompts |
| AI-F5 | Donor CRM tool coverage (`find_donor`, `log_gift`, `generate_acknowledgment`) |
| AI-F6 | Tax center tool coverage (`estimate_deduction`, `run_optimization`) |
~~| AI-F7 | Multi-turn tool execution loop |~~ _(see AI-B4 — still open)_
| AI-F8 | Per-org AI usage tracking for billing and abuse detection |

---

## Visualizations / Widgets

### Bugs (P1)

| # | Issue | Location |
|---|-------|----------|
| Vis-B1 | Waterfall "impact" mode uses `funds_allocated` — identical to "funding" mode — produces misleading board presentations showing funding data labeled as impact | `app/api/portfolio/[id]/waterfall/route.ts:89-148` |
~~| Vis-B2 | Timeline events no portfolio_id filter |~~ _(resolved Sprint B wave 5 — filtered by portfolio's investee_ids)_
~~| Vis-B3 | Widget registry exports only 3 of 14 types |~~ _(resolved Sprint B wave 5 — InlineWidget + registry.ts updated to all 14 types)_
| Vis-B4 | Drag-to-reorder in `EditWidgetsModal` only swaps two positions — dragging item 1 to slot 5 moves item 5 to slot 1, items 2–4 don't shift | `components/vis/EditWidgetsModal.tsx` |
| Vis-B5 | `ImpactBubbleChart` tooltip uses `event.pageX`/`event.pageY` (absolute) but tooltip is `position: absolute` inside container — tooltip appears offset on any scrolled page | `components/vis/ImpactBubbleChart.tsx:351-353` |
| Vis-B6 | `ImpactTimeline` horizontal mode has no ResizeObserver — SVG width set once on mount, breaks on window resize | `components/vis/ImpactTimeline.tsx:250` |
| Vis-B7 | N+1 query in waterfall `metric` mode — one sequential DB query per holding | `app/api/portfolio/[id]/waterfall/route.ts:196-217` |
~~| Vis-B8 | `KpiTrend` production console.log spam |~~ _(resolved Sprint B wave 5)_
~~| Vis-B9 | `RadialProgress` production console.log spam |~~ _(resolved Sprint B wave 5)_

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
~~| Adm-B1 | AI mapping assist always sends `sample_records: []` |~~ _(resolved Sprint B wave 7 — page.tsx fetches 5 staging rows, client passes them to mapping-assist API)_
~~| Adm-B2 | Rollback hard `.limit(5000)` cap |~~ _(resolved Sprint B wave 7 — replaced with paginated loop, no upper cap)_
~~| Adm-B3 | Three different admin auth patterns |~~ _(resolved Sprint B wave 8 — lib/admin-auth.ts created; all Pattern A routes now use requireAdmin() from shared helper)_
~~| Adm-B4 | P2 | AI fix suggestion has no Accept button |~~ _(resolved — PATCH /api/admin/imports/[id]/errors endpoint writes proposed_value into transformed_data and clears the field's error; UI shows Accept → ✓ Accepted)_
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
~~| X1 | P1 | Module gating cosmetic |~~ _(resolved — Tax nav link now wrapped with orgModules.tax guard; tax/donors/compliance pages show "not enabled" UI when module flag is false)_
| X2 | P1 | Multi-entity UX is "first org/first portfolio wins" throughout — `/api/me` picks first portfolio; donors and compliance fetch first org; family offices managing multiple entities are not served |
~~| X3 | `family_office` missing from onboarding |~~ _(resolved Sprint B wave 7 — persona card added, org_type enum values aligned across full stack)_
~~| X4 | Letter generator label misleading |~~ _(resolved Sprint B wave 7 — renamed to "Portfolio Letter" on dashboard)_
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
| Dashboard | — | — | 6 | — | 6 |
| Holdings | — | 1 | 6 | — | 7 |
| Tax Center | — | 1 | 7 | — | 8 |
| Compliance | — | — | 7 | — | 7 |
| QuickBooks | — | 3 | 2 | — | 5 |
| Donor CRM | — | — | 8 | — | 8 |
| Charities | — | — | 11 | — | 11 |
| AI Assistant | — | 3 | 9 | — | 12 |
| Visualizations | — | 5 | 6 | — | 11 |
| Admin / Import | — | — | 9 | — | 9 |
| Cross-Cutting | — | 2 | 3 | 1 | 6 |
| **Total** | **—** | **15** | **74** | **1** | **90** |
