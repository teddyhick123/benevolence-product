# Finance Director — QA Findings

> Audit scope: tax management, QuickBooks Online integration, and financial exports.
> Codebase: Next.js 15 / TypeScript / Supabase (RLS).
> Audit date: 2026-04-02.

---

## 🔴 Critical (will crash or data loss)

### 1. QB env vars missing — server crashes the moment any QB route is called

- **File:** `lib/integrations/quickbooks/client.ts:136–139`, `lib/integrations/quickbooks/client.ts:209–210`
- **What happens:** `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, and `QB_REDIRECT_URI` are referenced with the non-null assertion operator (`!`) but are completely absent from `.env.local`. On every call to `createOAuthClient()` or `getAuthenticatedQBClient()`, the `intuit-oauth` and `node-quickbooks` constructors receive `undefined`. The OAuth flow (`/connect`, `/callback`, token refresh, `/sync/accounts`, `/export/contributions`, `/export/grants`) will throw at runtime — either the OAuth library rejects the undefined credentials or downstream QBO API calls return 401/400 errors and the catch blocks surface a 500 to the user.
- **Reproduction:** Click "Connect to QuickBooks" in the integrations settings page. The `GET /api/integrations/quickbooks/connect` route calls `createOAuthClient()` which passes `undefined` for clientId, clientSecret, and redirectUri to `new OAuthClient(...)`.
- **Fix:** Add `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, and `QB_ENVIRONMENT` to `.env.local` and to production secrets. Add startup guards:
  ```ts
  if (!process.env.QB_CLIENT_ID) throw new Error('QB_CLIENT_ID is required');
  ```

---

### 2. `complianceRate` is `null` when there are no contributions — crashes the print page

- **File:** `app/dashboard/tax/print/page.tsx:207`
- **What happens:** The summary object can have `complianceRate: null` (as documented by the `ExportData` type on line 30 and calculated in `app/api/portfolio/[id]/tax/export/route.ts:118–121` where it is set to `null` when `contributionCount === 0`). Line 207 of the print page renders `({data.summary.complianceRate}%)` without a null guard. When `complianceRate` is `null`, this renders `(null%)` — ugly but not a crash. However if the data structure arrives with `complianceRate` being `undefined` (e.g., from a slightly different code path) `.toFixed()` would throw. More immediately: line 338 of the CSV generator does `${data.summary.complianceRate}%` which puts the literal string "null%" into the downloaded CSV.
- **Reproduction:** Export CSV for a portfolio that has a tax profile but zero contributions for the selected year.
- **Fix:** Guard with `data.summary.complianceRate != null ? `${data.summary.complianceRate}%` : 'N/A'` (already done in the PDF generator at `lib/pdf/tax-report-generator.ts:83`, apply the same pattern to the print page and CSV generator).

---

### 3. `getAuthenticatedQBClient` silently returns `null` on token refresh failure — no user feedback

- **File:** `lib/integrations/quickbooks/client.ts:200–203`
- **What happens:** When the QB access token is expired and the refresh call fails (network error, revoked token, Intuit service issue), `getAuthenticatedQBClient` catches the error, logs it, and returns `null`. Callers in `/sync/accounts`, `/export/contributions`, and `/export/grants` then return HTTP 422 with `"QuickBooks not connected or token refresh failed"`. The UI in `QuickBooksSettings.tsx` surfaces this as a generic error toast. The stored `token_expiry` in the database is NOT updated, so every subsequent call also attempts and fails the refresh — hammering Intuit's token endpoint on every user action.
- **Reproduction:** Let the QB access token expire (it lasts 1 hour by default), then click "Sync Accounts".
- **Fix:** On persistent refresh failure, mark the connection as stale (e.g., set a `needs_reauth` boolean column) and prompt the user to reconnect. Also consider exponential back-off and not retrying more than N times without a new auth.

---

### 4. QB `disconnect` errors are silently swallowed — user may think they disconnected when they didn't

- **File:** `app/api/integrations/quickbooks/disconnect/route.ts:59–68`
- **What happens:** The `Promise.all([...delete from quickbooks_connections, ...delete from qb_accounts])` call has no error handling. If the DB delete fails (e.g., RLS policy issue, connection timeout), the route still returns `{ ok: true }` on line 70. The user sees "Disconnected from QuickBooks" but the connection record remains in the database.
- **Reproduction:** Simulate a DB error on the `quickbooks_connections` delete. The response is still 200 `ok: true`.
- **Fix:** Await the Promise.all result and check for errors before returning success:
  ```ts
  const [connResult, acctResult] = await Promise.all([...]);
  if (connResult.error || acctResult.error) {
    return Response.json({ error: 'Failed to remove connection' }, { status: 500 });
  }
  ```

---

### 5. Export route uses `supabasePublic()` (anon key + RLS) for all 7 formats but no auth guard — unauthenticated portfolio ID enumeration

- **File:** `app/api/portfolio/[id]/tax/export/route.ts:37–73`
- **What happens:** The route relies entirely on Supabase RLS to enforce access. If an unauthenticated (anonymous) request is made, `supabasePublic()` creates a server client with the anon key but no session cookie. RLS on `portfolios` will block the query, `portfolio` will be null, and the route returns 403. This is correct. **However**, the route does NOT check `!portfolio` before proceeding for the `txf`, `form8283`, `pdf`, and `carryforward` format branches — it only checks at line 71–73 (before the format switch). On closer inspection this is actually handled correctly because the check at line 71 short-circuits. **The actual risk**: the carryforward query at line 59 does NOT filter by `lte('originating_tax_year', year)` in a meaningful way — it fetches carryforwards from ALL years up to `year`. A user with access to the portfolio will see carryforwards from years they did not select, which may not be intended.
- **Reproduction:** Request `?format=carryforward&year=2024` — the carryforward query at line 281–288 only fetches `carryforward_eligible=true` contributions for the selected year, which is correct. But the main `carryforwards` query at line 59 fetches ALL carryforwards with `originating_tax_year <= year`, potentially including very old records in the exported data.
- **Fix:** This is a data accuracy issue. Document the intended behavior or add a filter to only include active (non-expired) carryforwards in exports.

---

### 6. `DELETE` contribution route fetches user auth inside the handler with a potential null dereference

- **File:** `app/api/portfolio/[id]/tax/contributions/[contributionId]/route.ts:127`
- **What happens:** Line 127 calls `(await sb.auth.getUser()).data.user?.id` inside `sb.from('portfolio_members').select()...eq('user_id', ...)`. If the session is missing, `user?.id` is `undefined`. The Supabase `.eq('user_id', undefined)` filter will match no rows, `membership` will be null, and the route returns 403 — that is the correct behavior. **BUT**: the `sb` here is `supabasePublic()` which is the server client with RLS. This is a private/internal call on the same client already attached to the request session, so this works correctly in practice. However, using `sb.auth.getUser()` on the public server client after a write operation is fragile — any future refactor that separates these clients could silently break auth.
- **Reproduction:** Send a DELETE with a valid session — works. But send one where `supabasePublic()` session has expired mid-request — the `can_edit_portfolio` RPC on the PUT route (line 56–65) would fail first, but the DELETE has a different pattern that could return 403 for unexpected reasons.
- **Fix:** Follow the same auth pattern as every other route: call `supabase.auth.getUser()` first, check for `!user`, and return 401 explicitly before any DB operation.

---

## 🟡 High (bad UX, confusing, likely to cause support requests)

### 7. QB "Export Contributions" button is enabled when no accounts have been synced — silent failure

- **File:** `components/integrations/QuickBooksSettings.tsx:144–178`
- **What happens:** The "Export Contributions" and "Export Grants" buttons are visible and enabled whenever `isConnected` is true, but the account dropdowns for Expense and Bank accounts are only shown after a sync (`accounts.length > 0`, line 350). Until the user clicks "Sync Accounts", `expenseAccountId` and `bankAccountId` are empty strings. The `handleExportContributions` function (line 144) checks for this and shows a message: "Please select expense and bank accounts before exporting." This is correct, but the buttons render in a section that has no visible "Sync accounts first" instruction, making the workflow confusing. The user clicks "Export", gets an error, wonders why.
- **Fix:** Disable the Export buttons when accounts haven't been synced, or show a hint above the export section: "Sync accounts first to configure export destinations."

---

### 8. `QuickBooksSettings` silently fails to load accounts on mount — export section never renders

- **File:** `components/integrations/QuickBooksSettings.tsx:130–142`
- **What happens:** `loadAccounts()` is only called from `handleSyncAccounts()` (line 121). On initial page load the component fetches `status` but never calls `loadAccounts()`. If accounts were synced in a previous session, the account dropdowns never appear — the user sees the Export sections but no account selectors, so exports always fail with "Please select expense and bank accounts."
- **Reproduction:** Connect QB, sync accounts, navigate away, return to the page. The "Export Contributions" section shows but with no dropdowns.
- **Fix:** Add `loadAccounts()` to the `useEffect` that runs on mount alongside `fetchStatus()`.

---

### 9. `TaxExportPanel` missing PDF/carryforward/JSON export buttons — users can't access all 7 formats from the UI

- **File:** `components/tax/TaxExportPanel.tsx:14`
- **What happens:** The export panel's `handleExport` function accepts `'csv' | 'xlsx' | 'print' | 'form8283' | 'turbotax'` as formats. There are no buttons for:
  - `pdf` (the jsPDF-generated server-side tax report)
  - `carryforward` (the carryforward schedule text file)
  - `json` (raw data dump)
  All three format handlers exist in the API route (`app/api/portfolio/[id]/tax/export/route.ts:252–317`) but are unreachable from the UI. The Print/PDF button opens a browser print dialog for an HTML page, which is different from the jsPDF server-generated PDF.
- **Fix:** Add buttons for the remaining formats or document the intentional omission. At minimum, add the carryforward schedule since it has standalone tax utility.

---

### 10. `complianceRate` renders as `null%` in the print page summary when there are no contributions

- **File:** `app/dashboard/tax/print/page.tsx:207`
- **What happens:** When `data.summary.complianceRate` is `null` (no contributions), the print summary renders: "Documentation Complete: 0 of 0 (null%)". This appears in the printed/saved PDF version of the tax summary.
- **Fix:** Guard: `data.summary.complianceRate != null ? `${data.summary.complianceRate}%` : 'N/A'`

---

### 11. AGI limits visualization silently absent when no tax profile exists

- **File:** `app/dashboard/tax/page.tsx:203`
- **What happens:** `{agiLimits && <AGILimitVisualizer limits={agiLimits} />}` renders nothing when no tax profile exists. There is no prompt telling the user that the AGI limits chart requires them to set up a tax profile first. New users see a blank gap below the contributions list.
- **Fix:** Add an informational callout: "Set up your Tax Profile above to see your AGI deduction limits."

---

### 12. QB `status` endpoint exposes `token_expiry` (exact timestamp) to the client

- **File:** `app/api/integrations/quickbooks/status/route.ts:36–42`
- **What happens:** The status endpoint returns `token_expiry` as a full ISO timestamp to the browser. This reveals the internal token lifecycle and could help an attacker time session hijacking attempts or understand the token rotation cadence. It also exposes `realm_id` (the QBO company ID), which is a sensitive identifier.
- **Fix:** Return `token_expired: boolean` only (already returned on line 40). Strip `token_expiry` and consider whether `realm_id` should be truncated or removed from the client-facing response.

---

### 13. QCD contributions are silently skipped in TXF export with no user notification

- **File:** `lib/tax/turbotax-export.ts:59–63`
- **What happens:** The `generateTXF` function skips QCD contributions (`continue` at line 63) with a comment saying they are "excluded from income." This is tax-correct, but the UI gives no indication that QCDs will be absent from the TXF file. A user with significant QCDs may download the TXF and import it into TurboTax, then be confused why their QCD amounts aren't reflected — especially since QCDs still need to be entered in TurboTax (as a reduction to taxable IRA distribution, not a Schedule A deduction).
- **Fix:** Return a `skippedQCDs` count from `generateTXF` and surface it in the API response/download notification: "Note: X QCD contribution(s) were excluded. You must enter these separately in your tax software."

---

### 14. `TaxExportPanel` does not handle `form8283` HTTP 400 gracefully — user sees "No qualifying contributions" as a generic error

- **File:** `components/tax/TaxExportPanel.tsx:44–47`
- **What happens:** When the Form 8283 API returns HTTP 400 (`{ error: 'No qualifying contributions', message: '...' }`) because there are no noncash contributions over $500, the export panel catches the error and displays the `error` field: "No qualifying contributions". This is technically correct but alarming — users may think something is broken rather than understanding they simply have no noncash contributions. The `message` field with a helpful explanation is discarded.
- **Fix:** For 400 responses, try to read `json.message` as a fallback before `json.error`, and/or show a softer "info" style message instead of a red error banner.

---

### 15. `ContributionDetailModal` does not prevent closing during a save operation — concurrent edits possible

- **File:** `components/tax/ContributionDetailModal.tsx:204–207`
- **What happens:** The close button (X icon on line 204) is always rendered and clickable, even when `saving` is `true`. A user can click Save, then immediately close the modal. The save request continues in the background. If successful, `onUpdate()` is called on the now-closed modal's stale closure, triggering a list refresh which is benign but unexpected. If the user opens a different contribution modal in the meantime, both modals' callbacks may race.
- **Fix:** Disable the close button while `saving` is true: `disabled={saving}`.

---

### 16. The `handleCancel` function in `TaxProfileSetup` does nothing if there is no existing profile

- **File:** `components/tax/TaxProfileSetup.tsx:122–130`
- **What happens:** When `profile` is null (first-time setup), clicking Cancel does nothing — the `if (profile)` block at line 123 skips all reset logic, so the form stays open with whatever the user had typed. There is also no Cancel button rendered in this state (correctly — line 285 conditionally shows Cancel only when `profile` exists), so this is not user-visible. However if the `isEditing` state somehow becomes `true` without a profile (the initial state, line 52), there is no way for the user to escape the form without saving.
- **Fix:** Low severity since the Cancel button is hidden in this case, but worth noting.

---

### 17. Conservation easement carryforward period hard-coded to 15 years but not applied to `expiresYear` in `calculateAGILimits`

- **File:** `lib/tax/turbotax-export.ts:331`, `lib/tax/agi-calculator.ts:177`
- **What happens:** In `generateCarryforwardReport`, conservation easements are correctly identified as having a 15-year carryforward period (line 331). But in `calculateAGILimits`, all carryforwards are stored with `expiresYear: taxYear + 5` (line 177), regardless of contribution type. If a user donates a conservation easement, the system will incorrectly show it expiring in 5 years instead of 15 years — potentially causing a premature "expiring soon" alert and incorrect utilization planning.
- **Reproduction:** Add a `conservation_easement` contribution type, observe the carryforward expiry year in the DB is `taxYear + 5`.
- **Fix:** Check `contribution.contribution_type` and set `expiresYear: taxYear + 15` for conservation easements before pushing to the `carryforwards` array.

---

## 🟢 Low (polish, minor improvements)

### 18. `generateCSV` in export route puts `$` signs inside dollar amount cells — breaks numeric analysis in Excel

- **File:** `app/api/portfolio/[id]/tax/export/route.ts:333–336`
- **What happens:** The CSV summary section writes rows like `Total Contributions,$12,000` with embedded `$` and locale-formatted commas. When opened in Excel, these cells are treated as text, not numbers. The contributions table (lines 347–361) correctly outputs raw numbers without formatting, which is inconsistent.
- **Fix:** Use raw numeric values in all CSV cells; let the user format them in their spreadsheet.

---

### 19. `loadAccounts` in `QuickBooksSettings` silently swallows all errors

- **File:** `components/integrations/QuickBooksSettings.tsx:130–142`
- **What happens:** The `catch` block is empty (line 139: `// non-critical`). If the accounts endpoint returns an error (e.g., 401 due to session expiry), the user sees no feedback — the account dropdowns simply never appear.
- **Fix:** At minimum, log the error or show a subtle "Could not load accounts" hint.

---

### 20. `TaxProfileSetup` shows "$0" for estimated AGI when none is set, potentially misleading

- **File:** `components/tax/TaxProfileSetup.tsx:307–309`
- **What happens:** The read-only view shows `${profile.estimated_agi?.toLocaleString() || '0'}` which renders as "$0" when `estimated_agi` is null. A user who hasn't entered their AGI might see $0 and assume their AGI data was lost.
- **Fix:** Show "Not set" instead of "$0" when `estimated_agi` is null.

---

### 21. `Form8283` PDF embeds "Rev. December [year]" based on the selected tax year — Form 8283 rev date does not change annually

- **File:** `lib/tax/form8283-generator.ts:84`
- **What happens:** Line 84 renders `(Rev. December ${tax_year})`. The actual IRS Form 8283 has a fixed revision date (e.g., "Rev. October 2023") that only changes when the IRS updates the form, not every tax year. This could confuse a tax professional who recognizes the real form revision cycle.
- **Fix:** Hard-code the current IRS revision date (e.g., "Rev. October 2023") and update it manually when IRS revises Form 8283.

---

### 22. `TaxExportPanel` type signature excludes `'pdf'` and `'carryforward'` from the `handleExport` union

- **File:** `components/tax/TaxExportPanel.tsx:14`
- **What happens:** The function signature `handleExport(format: 'csv' | 'xlsx' | 'print' | 'form8283' | 'turbotax')` omits `'pdf'` and `'carryforward'` even though the API supports them. Any future developer adding a PDF button will get a TypeScript error.
- **Fix:** Add all supported formats to the union type.

---

### 23. Tax overview route caches with `s-maxage=60` — stale data risk after contribution edits

- **File:** `app/api/portfolio/[id]/tax/overview/route.ts:139`
- **What happens:** The overview is cached with `Cache-Control: private, s-maxage=60`. If a user adds or edits a contribution and then immediately views the tax overview, they may see stale totals for up to 60 seconds. The contributions list and the overview are fetched independently, so totals can appear inconsistent.
- **Fix:** Use `no-store` or reduce `s-maxage` to `0` for the overview route, or implement cache invalidation on contribution mutations.

---

### 24. `OBBB_CHARITABLE_CHANGES` constants are defined but not applied in `calculateAGILimits` for 2026

- **File:** `lib/tax/agi-calculator.ts`, `lib/tax/constants.ts:160–192`
- **What happens:** The One Big Beautiful Bill Act introduces a 0.5% AGI floor for 2026+ (deductions only above this floor) and a 35% benefit cap. These constants are defined in `constants.ts` with helper functions (`calculateOBBBAGIFloor`, `calculateEffectiveDeductionValue`) but `calculateAGILimits` does not apply the floor or the cap. For any user with a 2026 tax year, the AGI limit calculations will be incorrect — showing full deductibility when the OBBB floor should reduce it.
- **Reproduction:** Select tax year 2026 in the Tax Center. The "Deduction Limits" preview in TaxProfileSetup shows the full 60%/30% figures without the 0.5% AGI floor reduction.
- **Fix:** Apply `calculateOBBBAGIFloor` to reduce `totalDeductible` for tax years >= 2026.

---

## Summary

- **6 critical**, **11 high**, **7 low** issues found
- **Overall assessment:** The QB integration will not function in any environment without the four missing env vars; this is a hard blocker. The tax export and compliance features are largely sound architecturally but have several UX gaps and one calculation error (conservation easement carryforward period) that could produce incorrect tax data for users. The OBBB 2026 floor/cap rules are modeled in constants but not wired into the calculator, which will cause incorrect deduction limit figures starting this tax year.
