# AI Assistant (Ben) — Module Review

**Reviewer:** Senior Product Engineer  
**Date:** 2026-04-26  
**Files reviewed:**  
- `lib/claude-assistant.ts` (~2930 lines — primary)  
- `lib/ai-action-executor.ts`  
- `app/api/ai/chat/route.ts`  
- `app/api/ai/undo/route.ts`  
- `app/api/ai/redo/route.ts`  
- `app/api/ai/transcribe/route.ts`  
- `app/api/portfolio/[id]/letter/generate/route.ts`  
- `components/AIAssistantPanel.tsx`  
- `components/AIAssistantButton.tsx`  
- `components/AISummaryCard.tsx`  
- `app/dashboard/letter/page.tsx`  

---

## Tool Coverage Assessment

Ben exposes 18 tools across five capability categories. Coverage is strong for the core portfolio management loop but has notable gaps.

### Write Tools (mutate data)
| Tool | What it does |
|---|---|
| `add_holding` | Creates a new holding |
| `update_holding` | Updates fields on an existing holding |
| `remove_holding` | Deletes a holding |
| `add_metric_fact` | Logs a KPI data point to a holding |
| `create_widget` | Creates a holding-level widget |
| `add_location` | Attaches a geographic location to a holding |

### Read / Query Tools
| Tool | What it does |
|---|---|
| `list_holdings` | Fetches holdings, filtered by status |
| `search_holdings` | Multi-criteria holding search |
| `get_metric_trend` | Time-series for a metric code |
| `compare_holdings` | Compares a metric across holdings |
| `get_portfolio_summary` | AUM, sector breakdown, top holdings, KPI roll-up |
| `get_holding_details` | Deep fetch of a single holding with metrics and widgets |
| `list_widgets` | Lists portfolio-level widgets |

### Visualization Tools
| Tool | What it does |
|---|---|
| `display_widget` | Inlines an existing saved widget into the chat |
| `create_portfolio_widget` | Creates a preview portfolio-level widget |
| `get_chart_data` | Fetches data + auto-generates a D3 preview widget |
| `generate_d3_chart` | Generates a fully custom D3 chart from caller-supplied data |

### Report Tools
| Tool | What it does |
|---|---|
| `generate_holding_report` | Structured rich report (text + inline charts) for one holding |
| `generate_custom_report` | Portfolio / sector / holding scoped reports with configurable sections |
| `save_report_template` | Persists a report config as a reusable template |
| `list_report_templates` | Lists saved templates |

### Missing Tools (notable gaps)

1. **Donor and tax data** — No tool to query `donors`, `tax_contributions`, or `filing_calendar`. The `getPortfolioContext` method does fetch org-level donor counts and next filing dates for system-prompt context, but Ben cannot answer questions like "Who are my top donors this year?" or "What's my carryforward balance?" with any tool.

2. **Holding-level widget listing** — `list_widgets` only queries the `widgets` table (portfolio-level). `holding_widgets` is never listed, so Ben cannot surface holding-level widget IDs in tool output even though `display_widget` and `get_holding_details` can reach them.

3. **Contribution / tax CRUD** — No `add_contribution`, `update_contribution`, or `log_deduction` tools. The tax center is entirely invisible to Ben.

4. **Compliance / filing** — No tool to query, create, or update `filing_calendar` entries.

5. **Bulk operations** — No `bulk_update_holdings` or `batch_add_metrics` tool. Multi-holding edits require Claude to loop serially, which is expensive and slow.

6. **Export** — No tool to trigger PDF export or email delivery of reports. The letter page has print-to-PDF but it is not reachable from chat.

7. **`list_holdings` status default is hardcoded** (`lib/claude-assistant.ts` line 811): the tool definition declares `status` as optional, but the implementation falls back to `'Active'` when no status is passed. A user asking "list all my holdings" will silently miss Exited and Pipeline holdings. This is a functional bug.

---

## Prompt Quality & Safety

### System Prompt Strengths (`buildSystemPrompt`, lines 2679–2928)

- **Rich live context injected at call time**: The system prompt is dynamically assembled from a 7-table parallel DB fetch (`getPortfolioContext`, lines 2391–2674). It includes holding IDs, metric codes with actual data points, KPI targets, existing widget IDs, org-level donor counts, and next compliance filing. This prevents hallucination on IDs and metric codes — Claude can only reference what the system prompt contains.

- **Tight visualization guardrails**: The prompt explicitly forbids markdown images (`![...](...)`), prohibits listing data as bullets when a chart exists, and instructs Claude to keep text brief after a chart is generated. The forbidden-pattern example (lines 2847–2855) is unusually specific and effective.

- **Chart-type decision rules**: The prompt gives concrete heuristics (pie only for ≤6 categories, bar for comparisons, line for trends) so Claude does not guess.

- **Metric code grounding**: The `METRICS WITH DATA` section lists only metric codes that have actual facts in the DB, with a directive (line 2834) to refuse requests for unlisted metrics and suggest alternatives. This is a strong hallucination guard.

- **Org-context awareness**: `orgBlock` (lines 2723–2742) tells Ben whether the org has donor/compliance modules active, so it can respond appropriately to questions about those features.

### System Prompt Weaknesses

- **No date/time awareness**: The system prompt never tells Ben today's date. For a compliance platform with due-date-sensitive filings, this matters. If a user asks "how many days until our 990 deadline?", Ben cannot answer correctly.

- **No explicit role-based instruction**: The prompt does not tell Ben to behave differently for `viewer` vs `admin` roles. A viewer who can chat can also trigger `add_holding`, `update_holding`, and `remove_holding` tool calls (see Trust & Safety below).

- **No hallucination guard for holding IDs**: While the prompt lists up to 15 holdings with IDs, it truncates beyond 15 (line 2768). For portfolios with 16+ holdings, Ben cannot see the full ID list but the tool definitions do not enforce that the model only uses IDs it was shown. A user can paste any UUID and Ben will pass it to the executor without additional validation.

- **No conversation length / token guard**: The system prompt can grow very large for a portfolio with many metrics. There is no trimming strategy or compression. For large portfolios, the combined system prompt + conversation history could approach the 200K context limit and trigger API errors.

- **Single-turn tool execution only**: The `chat()` method (lines 571–703) executes exactly one round of tool calls (one `messages.create` → execute tools → one final `messages.create`). If Claude's final response contains another tool use block (which can happen with multi-step reasoning), it is silently ignored. Complex requests like "list my holdings, find the one with the highest CO2, and generate a report" may fail or produce an incomplete response.

---

## Competitive Assessment

### What Ben Does Well vs. Competitors

**vs. Salesforce Einstein / Blackbaud AI**  
Both competitors surface canned AI summaries on static dashboards. Ben is conversational and can _modify_ data, not just read it. The tool-use architecture with undo/redo has no equivalent in Blackbaud's feature set. The inline chart generation inside the chat window — where Ben materializes a D3 widget directly in response to a natural-language request — is a genuine capability gap vs. the competition.

**vs. "Just use Claude.ai directly"**  
This is the real threat. Ben's moat is:
1. **Live portfolio context** injected at every turn (Claude.ai has none)
2. **Write-back**: Ben can actually create holdings, log metrics, add locations. Claude.ai cannot mutate the database.
3. **Inline visualizations**: D3 charts render as actual interactive widgets inside the chat, not as static images or text tables.
4. **Undo/redo audit trail**: Every AI action is logged to `ai_actions` with before/after state. This is essential for fiduciary users.
5. **Voice input**: OpenAI Whisper transcription in the chat panel is a UX differentiator for executives who prefer dictating.

**vs. Microsoft Copilot in Word/Excel**  
Copilot works on documents, not live database state. Ben narrates live portfolio performance, not stale spreadsheet exports.

### Competitive Weaknesses

- **No streaming**: The response arrives as a complete JSON payload. For complex reports (which can involve multiple DB queries and 4K tokens), the user stares at a loading spinner for 15–30+ seconds with no feedback. Competitors with streaming feel dramatically faster, even if wall-clock time is similar.

- **No proactive insights**: Ben never initiates contact. Competitors like Salesforce Einstein surface alerts ("This donor hasn't given in 18 months") without being asked. Ben has all the data to do this but no trigger mechanism.

- **No multi-session memory**: The conversation history is stored per `ai_session` but sessions are scoped to a single sitting. If Ben learned something about the user's preferences ("always use bar charts for comparisons") in a previous session, that knowledge is gone. Claude.ai's Projects feature does this better.

- **Report output is not exportable from Ben**: The structured `content_blocks` reports are only rendered in the chat panel. They cannot be exported to PDF, emailed, or shared.

---

## Bugs & Reliability Issues

### Bug 1 — `list_holdings` silently filters to Active only (HIGH)
**File:** `lib/claude-assistant.ts`, line 811  
```ts
.eq('status', args.status || 'Active');
```
When `status` is not provided, the query defaults to `Active`, ignoring Exited and Pipeline holdings. The tool schema marks `status` as optional, so users expect "list all holdings" to return everything. Fix: remove the `|| 'Active'` default and let the query be unfiltered when `status` is absent.

### Bug 2 — Rate limiting missing on `/api/ai/chat` (HIGH)
**File:** `app/api/ai/chat/route.ts`  
The `aiLimiter` import is never called in `chat/route.ts`. Both `undo/route.ts` and `redo/route.ts` apply `aiLimiter.limit(user.id)`, but the primary chat endpoint — the most expensive route (Claude API + multiple DB queries) — has no rate limiting at all. A single authenticated user can hammer this endpoint without restriction. Given this hits the Anthropic API, this is a direct cost risk.

### Bug 3 — Single-level tool execution loop (MEDIUM)
**File:** `lib/claude-assistant.ts`, lines 620–694  
The `chat()` method executes tool calls once, then calls the final response API. If the final response also contains tool use blocks (possible when chaining requests like "search holdings, then generate a report for the top one"), those tool calls are silently ignored and the user gets an incomplete response with no error. Fix: wrap tool execution in a `while (stop_reason !== 'end_turn')` loop with a guard on max iterations.

### Bug 4 — `display_widget` records a `create` action for a display-only operation (LOW)
**File:** `lib/claude-assistant.ts`, lines 1151–1172  
When `display_widget` is called, it inserts an `ai_actions` row with `action_type: 'create'`. This pollutes the undo history with non-mutating events and could confuse users who see "Undo" buttons for what was just a view operation. The `operation_data` contains `display_only: true` which is not checked anywhere in the undo flow. Fix: either skip logging display actions or use a distinct `action_type: 'display'` that the UI and executor ignore for undo.

### Bug 5 — `updateHolding` in executor does not verify portfolio ownership (MEDIUM)
**File:** `lib/ai-action-executor.ts`, lines 80–137  
`updateHolding` and `deleteHolding` update/delete by `holding_id` without first verifying that `holding_id` belongs to the given `portfolioId`. The service-role Supabase client bypasses RLS. If a holding UUID from a different portfolio is passed (e.g., via a manipulated client request or a model hallucination), the executor will silently mutate it. Fix: add a `.eq('portfolio_id', portfolioId)` constraint on the update/delete query, or add a pre-flight ownership check.

### Bug 6 — Letter generation uses OpenAI GPT-4o, not Claude (LOW — architectural inconsistency)
**File:** `app/api/portfolio/[id]/letter/generate/route.ts`, line 193  
The letter generator calls `openai.chat.completions.create` with `gpt-4o`. Ben's conversational assistant uses Claude. This means two separate AI vendor dependencies for a single product surface. The letter chat interface (`app/dashboard/letter/page.tsx`) routes follow-up questions back through `/api/ai/chat` (Claude), creating an inconsistent experience where the initial letter prose and the follow-up Q&A come from different models with different personalities. More practically, it requires `OPENAI_API_KEY` to be provisioned alongside `ANTHROPIC_API_KEY`, adding operational complexity.

### Bug 7 — `generate_holding_report` only charts metrics with >= 2 data points (LOW)
**File:** `lib/claude-assistant.ts`, line 1857  
```ts
if (series.length >= 2) {
```
If a holding has only one metric data point (e.g., a one-time grant disbursement), no chart is generated and no text acknowledges this. The report silently omits the metric. Fix: render single-point metrics as a `metric_card` widget or include a prose callout.

---

## UX Gaps

### 1. No suggested prompts / starter questions
The welcome message lists capabilities but offers no clickable suggested prompts. Every competitor provides "chips" that users can tap to explore. Foundation executives and program officers are not power users — they need prompting. Suggested starters like "What's my portfolio's carbon footprint?" or "Generate a Q2 impact report" would dramatically increase engagement and reduce the "staring at a blank input" problem.

### 2. No streaming — response feels broken for long operations
`app/api/ai/chat/route.ts` returns a single JSON response. For a `generate_custom_report` call that touches 10+ holdings and generates 6 charts, the user can wait 20–45 seconds with only a spinner. No token streaming, no "thinking..." progress, no intermediate status updates. This is the single biggest UX gap for enterprise users. The Anthropic SDK supports streaming (`anthropic.messages.stream()`).

### 3. Undo/redo UX is bare-bones
`AIAssistantPanel.tsx` shows the last 3 actions in a tiny 24px-height panel. The undo button shows only `actionType` + `entityType` ("create holding") with no holding name. There is no batch undo (multiple related actions from one user message). The redo route exists but the panel never loads or displays undoable items that have been undone — the `loadActions` call fetches all `ai_actions` ordered by `created_at`, but the panel only renders `status === 'applied'` (undo) and `status === 'undone'` (redo) — there is no visual stack showing what sequence they belong to.

### 4. Letter page chat does not render `content_blocks`
**File:** `app/dashboard/letter/page.tsx`, line 199 vs `AIAssistantPanel.tsx` line 154  
`AIAssistantPanel` supports the rich `content_blocks` format (interleaved text + charts). The letter page chat does not — it uses the older `widgets` array format only. If a user asks Ben to "generate a detailed report" from the letter page, they get charts via the old widget path but miss the structured narrative sections that `generate_holding_report` produces.

### 5. No indication of Ben's "thinking" about which tools to call
Users cannot see which tools were invoked or what data was fetched. For trust and education (important for fiduciary users), showing a collapsed "Ben looked at: 3 holdings, 5 metric trends" summary would reduce the "black box" perception.

### 6. `AIAssistantButton` is always visible on all dashboard pages
**File:** `components/AIAssistantButton.tsx`  
Ben appears as a floating button on every dashboard page. On narrow content like the tax center or compliance calendar, the button obscures content at the sm breakpoint. More importantly, there is no context-switching: Ben opened from the `/dashboard/tax` page has no idea it's on the tax page because the portfolio context (`getPortfolioContext`) does not include the current UI route. Ben cannot proactively offer "I see you're on the Tax Center — would you like to see your carryforward analysis?"

---

## Missing Features

### 1. Streaming responses (Critical for UX)
`lib/claude-assistant.ts` uses `this.anthropic.messages.create()` (blocking). Switch to `this.anthropic.messages.stream()` and pipe tokens to the client via Server-Sent Events or the Vercel AI SDK `StreamingTextResponse`. This is the single highest-impact missing feature.

### 2. Proactive / scheduled insights
No mechanism exists for Ben to proactively surface insights. Foundation executives want to open the dashboard and see "Your carbon reduction metric is 12% ahead of target — on track to hit goal 2 months early." This requires a scheduled job (BullMQ is already wired in) that runs `get_portfolio_summary`, compares against targets, and generates highlight bullets. The infrastructure is 80% there.

### 3. Multi-session conversational memory
Each `ai_session` is ephemeral. User preferences, preferred chart styles, and learned context do not persist. A lightweight `user_preferences` JSON blob on the session or user profile could prime each session with "User prefers bar charts, uses monthly time windows, focuses on carbon metrics."

### 4. Donor and tax tool coverage
The donor CRM and tax center are complete product surfaces with no AI integration. Users cannot ask "draft a thank-you letter for my top 5 donors this year" or "what's my 2025 charitable deduction estimate?" These are high-value natural-language queries for the target persona.

### 5. Report export from chat
`generate_holding_report` produces a rich `content_blocks` payload that renders beautifully in chat. There is no "Export this report" button. Users cannot share Ben-generated reports with board members or program officers who do not have platform access. A PDF render route (server-side puppeteer or Weasyprint) would unlock this.

### 6. Voice output / read-aloud
The transcription endpoint supports voice input (Whisper) but Ben never speaks. For executives who use the platform during commutes or on mobile, text-to-speech output of Ben's narration would be valuable. The Web Speech API is sufficient for a v1.

### 7. Widget "save to dashboard" from chat
`create_portfolio_widget` creates a `is_preview: true` widget. The system prompt tells Ben to instruct users to "click Save to Dashboard." But there is no save button rendered in `AIAssistantPanel.tsx` on the preview widget. The `InlineWidget` component is rendered but its ability to persist the preview widget is not wired. This is a broken end-to-end experience — the most compelling capability (creating visualizations via chat) has no save path in the current panel.

---

## Trust & Safety

### 1. Role-based access not enforced at tool level (HIGH)
**File:** `app/api/ai/chat/route.ts`, lines 85–106  
The chat route verifies that the user has a `portfolio_members` record but does not check the `role` field. A `viewer`-role member can send messages to Ben that trigger `add_holding`, `update_holding`, and `remove_holding` tool calls, which are executed by `AIActionExecutor` with the service-role client (bypassing RLS). There is no guard in `executeTool()` (`lib/claude-assistant.ts`, line 724) that checks whether the user's role permits write operations. Fix: pass the user's role into `ClaudePortfolioAssistant.chat()` and restrict write tools to `admin`/`owner`/`member` only.

### 2. Deletion tool is low-friction (MEDIUM)
`remove_holding` requires only a `holding_id` and an optional `reason`. The system prompt says "Ask for confirmation on deletes" (line 2926) but this is a soft instruction to the model, not a hard technical guard. A user who says "delete all my pipeline holdings" could trigger multiple `remove_holding` calls in a single turn. The undo system would recover the data, but the experience is alarming. Fix: require an explicit `confirm: true` field in the tool schema for delete operations, forcing a two-turn flow.

### 3. `update_holding` does not restrict which fields can be changed (MEDIUM)
**File:** `lib/claude-assistant.ts`, lines 155–170 and `lib/ai-action-executor.ts` lines 100–106  
The `changes` parameter is typed as `Record<string, any>` and passed directly to Supabase `.update(args.changes)`. There is no allowlist of permitted fields. Claude could theoretically be prompted to set `portfolio_id` (moving a holding to a different portfolio), `created_at`, or other internal fields. Fix: enforce an explicit allowlist in `AIActionExecutor.updateHolding()`.

### 4. `get_holding_details` exposes charities data without portfolio ownership check (LOW)
**File:** `lib/claude-assistant.ts`, line 1104–1115  
The `get_holding_details` tool queries by `args.holding_id` alone with no `portfolio_id` filter. Combined with the service-role client, a holding ID from any portfolio can be fetched including its associated `charities`, `metric_facts`, and `holding_widgets`. The outer `verifyPortfolioAccess` call at line 735 checks that the user belongs to the portfolio in the session context, but does not verify that the requested holding belongs to that portfolio. A user could supply a holding ID from another organization's portfolio.

### 5. No AI usage logging or per-org spend tracking
There is no table recording token consumption, model calls, or estimated cost per user/org/session. For a multi-tenant SaaS product, this is a gap — both for billing and for detecting abuse. The `ai_actions` table logs mutations but not read-only queries or API spend.

### 6. Error messages in production may leak internal details (LOW)
**File:** `app/api/ai/chat/route.ts`, lines 242–248  
```ts
return NextResponse.json(
  { error: error.message || 'AI chat failed', stack: ... },
  { status: 500 }
);
```
`error.message` from Supabase or Anthropic SDK errors can include table names, SQL fragments, or internal IDs. In production, only sanitized messages should be returned; full error detail should be logged server-side only.

---

## Overall Rating

**7/10**

Ben has an architecturally sound foundation: live portfolio context injection, genuine write-back capability via audited tool use, undo/redo with before/after state, inline D3 visualization rendering, voice input, and a thoughtfully instrumented system prompt. These features clear the bar for a meaningful competitive differentiator over both generic LLMs and legacy nonprofit software.

What holds it back from 9–10: the absence of streaming (the single largest UX gap for a power user audience), the rate-limiting miss on the primary chat endpoint (a live cost/safety risk), the role-bypass issue that lets viewer-role users trigger write operations, and a set of missing integrations with the platform's own modules (donor CRM, tax center, compliance) that would unlock the highest-value natural-language queries for the target executive persona.

---

## Priority Fixes (Top 5)

### P1 — Add rate limiting to `/api/ai/chat` (1 hour)
**File:** `app/api/ai/chat/route.ts`  
Add `aiLimiter.limit(user.id)` immediately after the user authentication check (after line 58), matching the pattern in `undo/route.ts` lines 51–52. This is a live production cost risk and takes minutes to fix.

### P2 — Fix role enforcement for write tools (1–2 days)
**File:** `app/api/ai/chat/route.ts` and `lib/claude-assistant.ts`  
Read `membership.role` after the membership check (line 88). Pass it into `ClaudePortfolioAssistant.chat()`. In `executeTool()` (line 724), add a guard: if `role === 'viewer'` and `functionName` is in `['add_holding', 'update_holding', 'remove_holding', 'add_metric_fact', 'create_widget', 'add_location']`, return a `{ action: null, output: { error: 'Insufficient permissions' } }` result and let Ben inform the user.

### P3 — Implement streaming responses (2–3 days)
**File:** `lib/claude-assistant.ts` and `app/api/ai/chat/route.ts`  
Replace `this.anthropic.messages.create()` with `this.anthropic.messages.stream()`. Pipe tokens to the client using the `Response` streaming API or Vercel AI SDK. Update `AIAssistantPanel.tsx` to consume SSE and append tokens progressively. This is the single change with the highest perceived performance improvement.

### P4 — Fix `list_holdings` status default and `updateHolding` field allowlist (2 hours)
**File:** `lib/claude-assistant.ts` line 811 and `lib/ai-action-executor.ts` lines 100–106  
Remove `|| 'Active'` from the `list_holdings` query so unfiltered calls return all holdings. In `updateHolding`, define an explicit allowlist `['name', 'sector', 'country', 'funds_allocated', 'status', 'description']` and filter `args.changes` through it before passing to Supabase.

### P5 — Wire "Save to Dashboard" for preview widgets in AIAssistantPanel (1 day)
**File:** `components/AIAssistantPanel.tsx` and `components/InlineWidget.tsx`  
The preview widget flow is architecturally complete but has no save UI in the chat panel. Add a "Save to Dashboard" button to `InlineWidget` when `widget.is_preview === true`. On click, call `POST /api/portfolio/[id]/widget` (or the equivalent save endpoint) with the preview config, strip `is_preview`, and surface a success toast. This closes the loop on the most demonstrable Ben capability — creating charts via conversation — which currently has no durable outcome.
