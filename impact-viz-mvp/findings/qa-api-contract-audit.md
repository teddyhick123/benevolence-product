# QA Audit: Frontend/API Contract Consistency
**Auditor:** QA Engineer (automated review)
**Date:** 2026-04-02
**Scope:** `components/`, `app/dashboard/`, `app/admin/` ↔ `app/api/`

---

## Summary

| Severity | Count |
|---|---|
| 🔴 High | 1 |
| 🟠 Medium | 2 |
| 🟡 Low / Info | 4 |
| ✅ Correct | All other audited contracts |

---

## 🔴 HIGH — QuickBooksSettings: `loadAccounts()` never called on mount

**File:** `components/integrations/QuickBooksSettings.tsx`
**Affected endpoints:** `GET /api/integrations/quickbooks/accounts`

### Problem

`loadAccounts()` is only ever called from within `handleSyncAccounts()`. It is **never triggered on component mount**, even when the connection status resolves as `connected: true`.

```tsx
// On mount — only fetchStatus() is called:
useEffect(() => {
  void fetchStatus();
}, [fetchStatus]);

// loadAccounts() is only called here:
async function handleSyncAccounts() {
  ...
  await loadAccounts();   // ← only path that calls it
}
```

### Impact

A returning user who already has synced accounts navigates to `/dashboard/settings/integrations`. The component shows `status.connected === true` but `accounts` state is always `[]`. The conditional `{accounts.length > 0 && <dropdowns>}` never renders. The user cannot select expense/bank accounts and cannot export contributions or grants **without first re-clicking "Sync Accounts"** every single session.

### API Contract

The endpoint `GET /api/integrations/quickbooks/accounts?portfolio_id=<id>` returns:
```json
{ "accounts": [{ "id": "...", "qb_account_id": "...", "name": "...", "type": "..." }] }
```
The component reads `d.accounts` — the shape matches. The bug is purely on the call-timing side.

### Fix

Call `loadAccounts()` in the same `useEffect` that calls `fetchStatus()`, or inside `fetchStatus()` when `connected === true`.

---

## 🟠 MEDIUM — Watchdog endpoint has no authentication or admin guard

**File:** `app/api/admin/imports/watchdog/route.ts`
**Endpoint:** `POST /api/admin/imports/watchdog`

### Problem

The route handler has **zero auth checks**. Anyone — even unauthenticated users — can POST to this endpoint and invoke the `mark_stale_import_jobs` database RPC.

```ts
export async function POST() {
  const supabase = createAdminClient();   // ← service-role, bypasses RLS
  const { data, error } = await supabase.rpc('mark_stale_import_jobs');
  ...
}
```

It uses `createAdminClient()` (service role key, bypasses RLS), so the RPC fires with full privileges.

### Impact

Unauthenticated callers can repeatedly force stale-job marking. Depending on what `mark_stale_import_jobs` does to in-flight jobs, this could disrupt running imports. At minimum it's an unintended public admin operation.

### Fix

Add the standard `requireAdmin()` guard (used by other routes in this directory) before the RPC call.

---

## 🟠 MEDIUM — `tax/export` route uses deprecated `supabasePublic` alias without explicit auth check

**File:** `app/api/portfolio/[id]/tax/export/route.ts`

### Problem

The route uses:
```ts
const sb = await supabasePublic();
```

`supabasePublic` is a deprecated alias that resolves to `createServerClient()` (confirmed in `lib/supabase.ts` line 97). So functionally it's the cookie-session client — it **does** carry the user's session. However:

1. Unlike every other portfolio API route, there is **no explicit `auth.getUser()` check**. The route proceeds with the Supabase client regardless of whether the session is valid.
2. Access control is delegated entirely to RLS: `if (!portfolio) return 403`. If the RLS policy on `portfolios` ever has a gap (e.g. during a migration), this endpoint would silently leak tax data rather than return 401.

### Impact

Currently low risk (RLS is the correct pattern for data access), but the pattern is inconsistent with all other portfolio routes in the codebase, and the missing explicit auth check means no 401 is ever returned — an unauthenticated request with no session would get a 403 (portfolio not found) rather than the semantically correct 401.

### Fix

Add:
```ts
const authClient = await createServerClient();
const { data: { user } } = await authClient.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```
And swap `supabasePublic` → `createServerClient`.

---

## 🟡 LOW — `BoardReportButton` can never specify a tax year for the board report

**File:** `components/portfolio/BoardReportButton.tsx`
**API:** `GET /api/portfolio/[id]/board-report`

### Problem

The API reads an optional `year` query param for the contribution total:
```ts
const taxYear = Number(url.searchParams.get('year') ?? new Date().getFullYear());
```

`BoardReportButton` never sets this param — it only sets `as_of`:
```ts
const params = new URLSearchParams();
if (asOfDate) params.set('as_of', asOfDate);
// no 'year' param ever set
```

### Impact

The "Total Contributions" figure in every generated board report will always reflect the **current calendar year**, regardless of the `as_of` date. For example, a report generated with `as_of=2024-12-31` will show 2026 contributions (zero or partial), not 2024. This is a silent data accuracy bug.

### Fix

Derive `year` from `asOfDate` (or accept it as a prop) and include `params.set('year', year)` in the request.

---

## 🟡 LOW — `json` export format wraps data in an extra `data` key

**File:** `app/api/portfolio/[id]/tax/export/route.ts`

### Problem

The `json` format returns:
```json
{ "data": { "meta": {...}, "summary": {...}, "contributions": [...] } }
```

All other formats stream a file directly. The outer `data` wrapper is inconsistent with the rest of the API surface (e.g., `/api/portfolio/[id]/summary` returns the object directly). For developer consumers of the `json` format, this requires extra unwrapping.

### Impact

The `TaxExportButton` component never consumes the JSON response body (it just triggers a file download via `res.blob()`), so there's no frontend breakage today. But any future consumer expecting a flat structure will be surprised.

---

## 🟡 LOW — `ImportReportViewer`: PDF filename is hardcoded, not from Content-Disposition

**File:** `components/admin/ImportReportViewer.tsx` (line 63)

### Problem

```ts
a.download = `migration-report.pdf`;   // hardcoded, no import ID
```

The API responds with:
```
Content-Disposition: attachment; filename="migration-report-<8-char-id>.pdf"
```

The component ignores the `Content-Disposition` header entirely and always saves the file as `migration-report.pdf`. Compare with `TaxExportButton`, which correctly reads the header.

### Impact

If a user downloads multiple migration reports, all files will be named identically and overwrite each other in the browser's download folder.

### Fix

Read the `Content-Disposition` header before calling `res.blob()`, same pattern as `TaxExportButton` lines 90–98.

---

## ✅ Contracts Verified as Correct

### `ImportReportViewer` ↔ `/api/admin/imports/[id]/report`

| Check | Result |
|---|---|
| `?format=markdown` → `{ markdown, url }` | ✅ Component reads `data.markdown` |
| `?format=pdf` → binary PDF buffer | ✅ Component calls `res.blob()` |
| Error shape `{ error: string }` | ✅ Component reads `body.error` |
| Auth: admin required | ✅ Both ends enforce admin |

### `TaxExportButton` ↔ `/api/portfolio/[id]/tax/export`

| Format | API Handler | Component Download |
|---|---|---|
| `json` | `NextResponse.json({ data: exportData })` | `res.blob()` → `.json` file ✅ |
| `csv` | `text/csv` + `Content-Disposition` | `res.blob()` + reads header ✅ |
| `xlsx` | `application/vnd.openxmlformats...` | `res.blob()` ✅ |
| `txf` | `text/plain` | `res.blob()` ✅ |
| `form8283` | `text/plain` | `res.blob()` ✅ |
| `carryforward` | `text/plain` | `res.blob()` ✅ |
| `pdf` | `application/pdf` | `res.blob()` ✅ |

All 7 formats handled end-to-end. Query params `?year=&format=` match exactly.

### `BoardReportButton` ↔ `/api/portfolio/[id]/board-report`

| Check | Result |
|---|---|
| `?as_of=` param name | ✅ Matches `url.searchParams.get('as_of')` |
| Response is PDF buffer | ✅ Component calls `res.blob()` |
| Error shape `{ error: string }` | ✅ Component reads `body.error` |
| Auth: authenticated user required | ✅ Both ends enforce session |

*(See Medium finding above re: missing `year` param for tax year.)*

### `QuickBooksSettings` ↔ `/api/integrations/quickbooks/*`

| Endpoint | Method | Payload | Response Shape | Match |
|---|---|---|---|---|
| `/status` | GET `?portfolio_id=` | — | `{ connected, realm_id, connected_at, last_sync_at, token_expiry, token_expired }` | ✅ |
| `/connect` | Navigation redirect | `?portfolio_id=` | 302 to Intuit | ✅ |
| `/disconnect` | POST | `{ portfolio_id }` | `{ ok: true }` | ✅ |
| `/sync/accounts` | POST | `{ portfolio_id }` | `{ ok, synced }` | ✅ |
| `/accounts` | GET `?portfolio_id=` | — | `{ accounts: QBAccount[] }` | ✅ (but never called on mount — see High finding) |
| `/export/contributions` | POST | `{ portfolio_id, tax_year, expense_account_id, bank_account_id }` | `{ ok, exported, failed }` | ✅ |
| `/export/grants` | POST | `{ portfolio_id, expense_account_id, bank_account_id }` | `{ ok, exported, failed }` | ✅ |

### OAuth Callback

`/api/integrations/quickbooks/callback` is invoked by Intuit (not by frontend JS). It correctly redirects to `/dashboard/settings/integrations?connected=1` on success and `?error=<code>` on failure. The integrations page (`app/dashboard/settings/integrations/page.tsx`) reads both `sp.connected` and `sp.error` from search params and renders appropriate banners. ✅

---

## Dead / Internal-Only Endpoints

| Endpoint | Status |
|---|---|
| `POST /api/admin/imports/watchdog` | No frontend caller found. Appears to be a maintenance/cron trigger endpoint. **Missing auth guard** (see Medium finding). |
| `GET /api/integrations/quickbooks/callback` | Called by Intuit OAuth redirect only — not by frontend code. Expected behavior for OAuth flow. ✅ |
| `POST /api/ai/undo`, `/api/ai/redo` | Not found in any component. Likely wired through `AIAssistantPanel` or `ai-action-executor.ts` — not audited in this pass. |
| `GET /api/external/charity-search` | Not found in any component in this audit scope. May be an internal or deprecated endpoint. |
