# QuickBooks Integration — Module Review

**Date:** 2026-04-26
**Reviewer:** Senior Product Engineer (automated review)
**Scope:** OAuth 2.0 connection, chart of accounts sync, journal entry export (contributions + grants)
**Files reviewed:**
- `lib/integrations/quickbooks/client.ts`
- `app/api/integrations/quickbooks/connect/route.ts`
- `app/api/integrations/quickbooks/callback/route.ts`
- `app/api/integrations/quickbooks/disconnect/route.ts`
- `app/api/integrations/quickbooks/status/route.ts`
- `app/api/integrations/quickbooks/accounts/route.ts`
- `app/api/integrations/quickbooks/sync/accounts/route.ts`
- `app/api/integrations/quickbooks/export/contributions/route.ts`
- `app/api/integrations/quickbooks/export/grants/route.ts`
- `components/integrations/QuickBooksSettings.tsx`
- `app/dashboard/settings/integrations/page.tsx`
- `app/settings/integrations/page.tsx`
- `db/migrations/0017_quickbooks.sql`
- `db/legacy/0051_quickbooks.sql` (historical)
- `db/legacy/0063_qb_org_migration.sql` (historical)

---

## OAuth & Token Management

### What works well

- **CSRF state nonce** is correctly implemented. `connect/route.ts` (line 39–44) generates a `crypto.randomUUID()` nonce, encodes it alongside `orgId` and `userId` in the base64url state parameter, sets it in an `HttpOnly; SameSite=Lax` cookie (10-minute TTL), and the callback validates cookie-vs-state parity before proceeding. This is textbook OAuth 2.0 CSRF protection.
- **Proactive token refresh** in `client.ts` (lines 181, 250) correctly triggers a refresh when the access token will expire within 30 days, which aligns with Intuit's recommendation.
- **Revocation on disconnect** (`disconnect/route.ts` lines 46–55) calls `oauthClient.revoke()` on the refresh token and correctly treats failure as non-fatal (best-effort), which is appropriate since Intuit's revoke endpoint is eventually consistent.
- **Org-scoped architecture** — one QB connection per org, enforced by `UNIQUE(org_id)` in `0017_quickbooks.sql` and upheld by the upsert-on-conflict pattern in the callback.

### Issues

**Critical — Schema column name mismatch (`token_expiry` vs `expires_at`)**

The canonical migration (`0017_quickbooks.sql`, line 24) names the column `expires_at`. However, every piece of application code — `client.ts` (lines 122, 177, 204, 247, 273), `callback/route.ts` (line 103), `status/route.ts` (lines 36, 44, 52) — references `token_expiry`. The legacy migration (`0051_quickbooks.sql`, line 13) used `token_expiry`. This mismatch will cause silent failures or runtime errors depending on which migration set is actually deployed. Every token refresh write will silently fail (Supabase returns no error for an unknown column in an update), meaning the app perpetually attempts to refresh, always reads the original expiry, and will eventually encounter a hard 401 from Intuit when the actual token expires.

**Moderate — No refresh token expiry enforcement**

The migration adds a `refresh_expires_at` column (`0017_quickbooks.sql`, line 25), but no application code reads or writes it. Intuit refresh tokens expire after 101 days of non-use. If a user's access token genuinely expires and the refresh token has also gone stale (after a long idle period), `getAuthenticatedQBClientByOrg` returns `null` silently and the UI displays no actionable error — just a generic "QuickBooks not connected" state. The user has no way to distinguish "never connected" from "refresh token expired."

**Minor — 30-day refresh window is too aggressive**

`client.ts` lines 178/248: refreshing any time the token expires within 30 days means the token is refreshed on essentially every request for the last month of the access token's life. Intuit access tokens expire in 1 hour. The 30-day window is presumably a legacy artifact from when the column was incorrectly used to store the 101-day refresh token expiry. The window should be 5 minutes for access tokens.

**Minor — No mutex / concurrent refresh race**

If two API requests arrive simultaneously and both find the access token within the refresh window, both will call `oauthClient.refresh()` concurrently. The second refresh call against Intuit will fail (Intuit invalidates the old refresh token immediately upon use). The winner writes its new token; the loser's token write may overwrite with invalid data or throw an unhandled error that returns `null` from `getAuthenticatedQBClientByOrg`. Under low-traffic conditions this is acceptable; under any parallel export scenario it is a real problem.

**Minor — State parameter does not validate `userId` against session**

`callback/route.ts` (line 44) decodes `userId` from the state but never checks that `decoded.userId === user.id`. Combined with CSRF nonce validation this is a defense-in-depth gap rather than an exploitable hole, but it should be asserted.

---

## Sync Accuracy & Reliability

### Chart of Accounts Sync

- `sync/accounts/route.ts` calls `findAccountsAsync` which uses the QB `FetchAll=true` query — this correctly pulls the full chart of accounts in one call (QB supports up to ~200 accounts before pagination is needed; `FetchAll` bypasses pagination for the query API).
- The upsert key is `(org_id, qb_account_id)`, which is correct. Renamed accounts in QB will be updated on the next sync.
- **Issue:** `sync/accounts/route.ts` maps `a.Id` to `qb_account_id` (line 60), but the `qb_accounts` table in `0017_quickbooks.sql` defines the column as `qb_id` (line 67), not `qb_account_id`. This is the same schema-vs-code mismatch pattern. If the `0017` migration is canonical, every account sync will fail silently (upsert writes to non-existent column `qb_account_id`; Supabase may return a validation error). Similarly, `accounts/route.ts` line 37 selects `qb_account_id` but the canonical schema column is `qb_id`. The legacy schema (`0051_quickbooks.sql` line 88) used `qb_account_id` — so the codebase was written against the old schema and the new migration was not reconciled.
- **Issue:** No incremental sync. Every sync fetches all accounts. For orgs with large charts of accounts (250+ accounts), QB's query API returns results in pages of 1000 max. The `FetchAll` workaround works, but no pagination handling exists — if an org has more than 1000 accounts this will silently truncate.
- **Issue:** Deactivated accounts in QB (`is_active: false`) are not filtered or marked inactive in the local `qb_accounts` table. After a sync, stale accounts remain selectable in the export dropdowns.
- **Issue:** `last_sync_at` on `quickbooks_connections` is updated (line 82 of sync route) but `last_sync_status` (defined in `0017_quickbooks.sql` line 34) is never written. If the sync fails after the QB call but before the upsert, `last_sync_at` is never updated either — which is correct — but on success there is no status trail for auditing.

### Journal Entry Export

- The journal entry format (Debit Expense / Credit Bank) is correct for charitable contributions and grant disbursements.
- `DocNumber` is constructed from the first 8 characters of the Benevolence UUID (`BEN-CONTRIB-{uuid_prefix}`, `BEN-GRANT-{uuid_prefix}`). This is a reasonable human-readable identifier but is **not guaranteed unique** — if two contributions share a UUID prefix collision (astronomically unlikely but possible), QB will reject the second with a duplicate DocNumber error.
- `QBJournalEntry.Line` items hardcode `AccountRef.name` as `'Charitable Contributions'` and `'Bank Account'` (contributions route lines 129, 137; grants route lines 137, 145). These are decorative hints to QB — QB ignores them and resolves accounts by `value` (the account ID). However, the hardcoded strings will appear incorrectly in QB if the actual account has a different name. This confuses accountants reviewing the QB audit trail.
- **Issue — No idempotency / duplicate-export guard:** There is no tracking of which contributions or grants have already been exported to QB. Running "Export" twice for the same year creates duplicate journal entries in QB. There is no `qb_exported_at` flag, no `qb_journal_entry_id` stored, no lookup before creation.
- **Issue — No QB API rate limit handling:** Intuit enforces 500 requests per minute per realm. The export routes batch 30 entries via `Promise.all` which effectively fires 30 concurrent QB API calls per batch. For an org with 150 contributions this results in 5 batches × 30 concurrent calls = up to 150 near-simultaneous QB requests, easily breaching the rate limit. The code has no retry logic, no exponential backoff, and no 429 handling.
- **Issue — Hard 2000-row limit:** Both export routes apply `.limit(2000)` (contributions line 85, grants line 85). For large foundations with multi-year histories exceeding 2000 rows, exports silently truncate without any warning to the user.
- **Issue — Grants export uses `total_committed`, not disbursed amount:** `export/grants/route.ts` posts the `total_committed` amount as the journal entry amount. For multi-year grants where disbursements occur in tranches, this double-counts the full commitment on the first export and has no mechanism to handle partial payments. Proper grant accounting requires posting per disbursement, not per commitment.
- **Issue — Contributions export uses `v_tax_contributions_enriched` view:** The view is filtered by `portfolio_id`, but the route collects `portfolioIds` from `portfolios.org_id = orgId` (line 74). This logic is correct in principle, but if a user belongs to multiple orgs and the `x-org-id` cookie is mismatched, all their org's portfolios get exported — there is no defense against this.

---

## Competitive Assessment

| Capability | Benevolence | Blackbaud Financial Edge NXT | Sage Intacct Nonprofit | QuickBooks Nonprofit Edition |
|---|---|---|---|---|
| OAuth 2.0 connect flow | Yes (basic) | N/A (native) | Native GL | N/A (same product) |
| Chart of accounts sync | One-way pull only | Bidirectional | Bidirectional | N/A |
| Journal entry export | Contributions + Grants | Full GL posting with fund accounting | Full posting with dimensions | Native entry |
| Duplicate export prevention | No | Yes | Yes | N/A |
| Class/fund tracking | No | Yes | Yes (dimensions) | Yes (classes) |
| Two-way sync | No | Full | Full | N/A |
| Budget vs. actuals | No | Yes | Yes | Yes |
| Bank reconciliation | No | Yes | Yes | Yes |
| Automatic token refresh | Yes | N/A | N/A | N/A |
| Rate limit handling | No | N/A | N/A | N/A |
| Nonprofit fund accounting | No | Yes | Yes | Partial |

Blackbaud Financial Edge NXT has native fund accounting (FASB ASC 958 net asset classes) built in. Sage Intacct Nonprofit offers dimensional accounting with grant tracking across funds. Benevolence's QB integration currently functions as a one-way push with no fund/class dimension support — the single biggest gap against competitors serving private foundations that are required to distinguish net asset classes in their financials.

---

## Bugs & Reliability Issues

**Bug 1 — Critical: Schema column name mismatch breaks token refresh and account sync**
- `client.ts` reads/writes `connection.token_expiry` and `token_expiry` in upsert; canonical schema (`0017_quickbooks.sql`) uses `expires_at`.
- `sync/accounts/route.ts` writes column `qb_account_id`; canonical schema uses `qb_id`.
- `accounts/route.ts` selects `qb_account_id`; canonical schema uses `qb_id`.
- Result: token refresh silently fails; account sync silently fails if 0017 is the deployed migration.
- Files: `lib/integrations/quickbooks/client.ts` lines 122, 204, 273; `app/api/integrations/quickbooks/callback/route.ts` line 103; `app/api/integrations/quickbooks/sync/accounts/route.ts` lines 60, 73; `app/api/integrations/quickbooks/accounts/route.ts` line 37.

**Bug 2 — High: Duplicate journal entry exports with no guard**
- Re-running export for the same year creates duplicate QB journal entries. No idempotency key is tracked in the DB.
- Files: `app/api/integrations/quickbooks/export/contributions/route.ts`, `app/api/integrations/quickbooks/export/grants/route.ts`.

**Bug 3 — High: `connect` route uses `orgId` query param; `QuickBooksSettings.tsx` sends `orgId` but server expects `org_id`**
- `connect/route.ts` line 19: `searchParams.get('org_id')` (underscore).
- `QuickBooksSettings.tsx` line 88: `handleConnect` navigates to `/api/integrations/quickbooks/connect?org_id=${orgId}` — this is correct.
- `IntegrationsTab.tsx` line 59: `connectHref={/api/integrations/quickbooks/connect?orgId=${orgId}}` — this uses `orgId` (camelCase) which does NOT match `org_id` that the server expects. The connect flow initiated from `app/settings/integrations` (which uses `IntegrationsTab`) will silently receive `null` for `orgId` and return a 400 error.
- Files: `components/settings/IntegrationsTab.tsx` line 59; `app/api/integrations/quickbooks/connect/route.ts` line 19.

**Bug 4 — Moderate: `disconnect/route.ts` does not pass `org_id` in the body when called from `IntegrationsTab.tsx`**
- `IntegrationsTab.tsx` line 49: `fetch('/api/integrations/quickbooks/disconnect', { method: 'POST' })` — no body, no `org_id`.
- `disconnect/route.ts` line 18: `body.org_id` will be `undefined`, returning a 400 immediately.
- `QuickBooksSettings.tsx` line 96 correctly passes `{ org_id: orgId }` — so the dashboard settings route works; the `/settings/integrations` route does not.
- Files: `components/settings/IntegrationsTab.tsx` line 49; `app/api/integrations/quickbooks/disconnect/route.ts` line 19.

**Bug 5 — Moderate: `getAuthenticatedQBClient` (portfolio-based) is a dead function**
- `client.ts` exports `getAuthenticatedQBClient(portfolioId)` (lines 170–233) which queries by `portfolio_id`. The canonical migration (`0017_quickbooks.sql`) has `org_id NOT NULL UNIQUE` and no `portfolio_id` column. This function will always return `null` in production. The org-scoped `getAuthenticatedQBClientByOrg` is the correct path and is used exclusively by all routes — but the dead export creates confusion and any future code using the wrong function will fail silently.
- Files: `lib/integrations/quickbooks/client.ts` lines 143–233.

**Bug 6 — Moderate: `QBConnection` interface declares both `portfolio_id` and `org_id` as nullable**
- `client.ts` line 116–117: `portfolio_id: string | null; org_id: string | null;`. Since the DB has `org_id NOT NULL`, `org_id` should be `string`, not `string | null`, to prevent false nullability in calling code.

**Bug 7 — Low: `status/route.ts` reads `connected_at` from DB but this column does not exist in `0017_quickbooks.sql`**
- The `0017` migration has no `connected_at` column. The legacy `0051` migration did. The status endpoint queries `connected_at` (line 36) — this will return `null` silently on a fresh install.
- Files: `app/api/integrations/quickbooks/status/route.ts` line 36.

---

## UX Gaps

1. **No token-expired warning flow.** `status/route.ts` returns `token_expired: true` and `QuickBooksSettings.tsx` displays the expiry date in red (line 327). However, the UI does not disable export buttons or display a banner when the token is expired — the user can click "Export" on an expired connection and receive the opaque error "QuickBooks not connected or token refresh failed" with no guidance to reconnect.

2. **No sync progress or async feedback.** Account sync and exports are synchronous HTTP calls with a single spinner. For orgs with many contributions, the UI locks (the `actionLoading` flag disables all buttons) with no progress indication, estimated time, or background job. Large exports (e.g., 300+ contributions) will hit the 30-second Vercel function timeout.

3. **No preview before export.** Users cannot see which records will be exported before committing. There is no "preview" mode, no count display, and no date-range filter for grants. For a CFO reviewing a $5M grant portfolio before an audit, this is a critical trust gap.

4. **No indication of partial success details.** When `failed > 0`, the UI shows "X contributions exported (Y failed)" but does not surface which records failed or why (the `failures` array is returned in the API response but never rendered in the component — `QuickBooksSettings.tsx` lines 173–180).

5. **Dual integration pages with inconsistent behavior.** There are two separate integration pages:
   - `/dashboard/settings/integrations` → uses `QuickBooksSettings.tsx` (full-featured)
   - `/settings/integrations` → uses `IntegrationsTab.tsx` (minimal, with the `orgId` and disconnect bugs above)
   Both are reachable from the nav. This creates a confusing split experience and two different code paths to maintain.

6. **Connection success banner auto-dismisses immediately.** The `?connected=1` query param is read on page load in `app/dashboard/settings/integrations/page.tsx` (line 55) and rendered, but the banner has no timeout — it persists in the URL and would reappear on refresh. A redirect-after-success pattern or removing the query param after display would be cleaner.

7. **"Sync Accounts" must be run manually before exports work.** The export account-selector dropdowns are hidden until accounts are synced. If a user connects and immediately tries to export, there is no auto-sync trigger and no inline prompt explaining why the export controls are absent.

---

## Missing Features

**Functional gaps vs. competitors and user expectations:**

1. **No QB fund / class dimension mapping.** Nonprofit accounting in QB Online requires Class tracking to separate fund activity (unrestricted, temporarily restricted, permanently restricted per ASC 958). Every journal entry Benevolence creates is unclassified. Private foundations are legally required to track net asset classes — this makes the exported entries non-compliant for most target customers without manual QB reclassification.

2. **No incremental / differential export.** Every export re-sends all contributions for the selected year. There is no tracking of what has been posted to QB (`qb_exported_at` flag, `qb_journal_entry_id`). Foundations running monthly closes need incremental exports.

3. **No two-way sync or QB-to-Benevolence import.** The integration is write-only from Benevolence's perspective. Changes made directly in QB (reclassification, corrections) are not visible. Competitors offer bidirectional sync.

4. **No budget tracking.** QB Online has a budget module. Benevolence has no mechanism to create or track QB budgets from foundation giving plans.

5. **No vendor / payee creation.** When journal entries are exported, charitable organizations should be created as Vendors in QB for proper 1099 and payable tracking. The current export creates journal entries with account references only — no vendor linkage.

6. **No bank reconciliation support.** QB's bank reconciliation feature expects cleared transactions with individual amounts. Benevolence exports lump-sum journal entries per contribution rather than using QB's deposit/payment objects that integrate with bank feeds.

7. **No multi-currency support.** The DB schema has `currency text DEFAULT 'USD'` on `qb_accounts` and `qb_transactions`, but the export routes do not pass currency to QB. Multi-currency contributions (common for global family foundations) will be exported in USD regardless.

8. **No scheduled / automatic sync.** Sync requires manual user action. There is a `sync_interval_hours` column in the migration and a `sync_enabled` flag, but no background job or webhook triggers these — the columns are decorative.

9. **No audit trail for exports.** No record is kept of who triggered an export, when, and what was included. For foundations subject to audit, this is a compliance gap.

10. **No support for QB Desktop or QB Enterprise.** Both products are common among family office accounting teams. The integration is exclusively QB Online.

---

## Security Assessment

**Positive findings:**
- Tokens are stored in PostgreSQL (Supabase), not in cookies or environment variables.
- RLS policies on `quickbooks_connections` restrict access to `is_org_admin(org_id)` + `org_has_module(org_id, 'quickbooks')` — only org admins with the module enabled can see or modify tokens.
- All routes validate user session before any DB operation.
- `createAdminClient()` is used intentionally for privileged token operations (callback, disconnect), with the rationale documented (line 93 of callback route).
- CSRF nonce correctly prevents OAuth flow hijacking.
- OAuth scopes are appropriately minimized: `Accounting` + `OpenId` only (connect route line 46).

**Issues:**

1. **Access tokens stored in plaintext.** `access_token` and `refresh_token` are stored as `TEXT` in Postgres. Supabase does not encrypt column values at rest beyond disk-level encryption. If the DB is compromised, all QB tokens are directly readable. Intuit recommends encrypting tokens at rest using application-level AES-256.

2. **Membership check is insufficient for privileged QB operations.** The connect, sync, disconnect, and export routes all check `organization_members` for any membership (`select('id')` with no role filter — `connect/route.ts` line 26, `callback/route.ts` line 57, `disconnect/route.ts` line 28, `sync/accounts/route.ts` line 28, `export/contributions/route.ts` line 58, `export/grants/route.ts` line 51). A `viewer` role member of the org can trigger an export to QB or disconnect the connection. These operations should require `admin` or `owner` role. The RLS policy correctly restricts DB reads to `is_org_admin`, but the API-layer check allows any member to call the route — creating an authz bypass for writes that use `createAdminClient()`.

3. **`org_id` in export/sync routes is taken from the request body without cross-checking against the session org.** A member of org A who knows org B's UUID could submit `org_id: orgB` and, if they somehow have membership in org B (even viewer), trigger exports or syncs for org B's QB connection. The membership check prevents pure IDOR against org B, but a user who is a viewer in multiple orgs could perform admin actions in any of them.

4. **No PKCE.** The OAuth flow uses the standard authorization code flow without PKCE (Proof Key for Code Exchange). While the CSRF state parameter mitigates most attack vectors, PKCE is the current recommended standard for server-side OAuth 2.0 flows. The `intuit-oauth` library supports PKCE.

5. **Nonce cookie is `SameSite=Lax`, not `SameSite=Strict`.** `connect/route.ts` line 54. `Lax` allows the cookie to be sent on top-level navigations from external sites (e.g., a link in email), which slightly weakens the CSRF protection. `Strict` would be safer but would break the Intuit redirect callback — `Lax` is actually the correct choice here. This is not a bug but is worth documenting.

---

## Overall Rating

**4.5 / 10**

The OAuth plumbing has a solid structural foundation — CSRF nonces, proactive refresh, org-scoped architecture, and RLS-backed token storage are all well-designed. However, the module is currently non-functional in production due to a critical schema name mismatch between the canonical `0017_quickbooks.sql` migration and all application code (columns `expires_at` vs. `token_expiry`, `qb_id` vs. `qb_account_id`). Beyond the bugs, the export layer lacks the features that matter most to the target user (CFOs at private foundations): no idempotency guard means every re-run creates duplicate QB entries, no fund/class dimension support means exported entries are non-compliant with ASC 958, and the authorization model allows viewer-role members to execute admin-level QB operations. Against Blackbaud Financial Edge NXT and Sage Intacct Nonprofit the feature parity gap is substantial, though those are full GL systems rather than QB integrations.

---

## Priority Fixes (Top 5)

### Fix 1 — Resolve schema column name mismatches (Critical)
**Files:** `lib/integrations/quickbooks/client.ts`, `app/api/integrations/quickbooks/callback/route.ts`, `app/api/integrations/quickbooks/status/route.ts`, `app/api/integrations/quickbooks/sync/accounts/route.ts`, `app/api/integrations/quickbooks/accounts/route.ts`

The canonical migration `db/migrations/0017_quickbooks.sql` uses `expires_at` (not `token_expiry`) and `qb_id` (not `qb_account_id`). Either update the migration to match the code, or update all code references to match the migration. Recommend updating the migration to use `token_expiry` (already used everywhere in code) and `qb_account_id` (already used everywhere in code) and adding `connected_at` to `quickbooks_connections`. This is the single fix that unblocks the entire module from being non-functional.

### Fix 2 — Add idempotency guard on journal entry exports (High)
**Files:** `app/api/integrations/quickbooks/export/contributions/route.ts`, `app/api/integrations/quickbooks/export/grants/route.ts`, `db/migrations/0017_quickbooks.sql`

Add `qb_exported_at TIMESTAMPTZ` and `qb_journal_entry_id TEXT` columns to `tax_contributions` (or create a join table `qb_export_log`). Before creating a journal entry, check whether the record has already been exported. If so, skip it. Return a count of skipped records to the UI. This prevents the most immediately harmful user-facing bug.

### Fix 3 — Restrict QB operations to admin/owner roles (High)
**Files:** All six route files under `app/api/integrations/quickbooks/`

Change the membership check from:
```ts
.select('id')
.eq('org_id', orgId)
.eq('user_id', user.id)
```
to:
```ts
.select('id, role')
.eq('org_id', orgId)
.eq('user_id', user.id)
.in('role', ['owner', 'admin'])
```
Apply to: `connect`, `callback`, `disconnect`, `sync/accounts`, `export/contributions`, `export/grants`. The `status` and `accounts` (read-only) endpoints can remain open to all members.

### Fix 4 — Fix `IntegrationsTab.tsx` connect URL and disconnect body (Moderate)
**Files:** `components/settings/IntegrationsTab.tsx`

Line 59: Change `?orgId=${orgId}` to `?org_id=${orgId}`.
Line 49: Change the fetch call to include the request body: `{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId }) }`.
Also consider consolidating the two integration pages (`/settings/integrations` and `/dashboard/settings/integrations`) into a single component to eliminate the maintenance split.

### Fix 5 — Add QB Class tracking to journal entry exports (High — product quality)
**Files:** `app/api/integrations/quickbooks/export/contributions/route.ts`, `app/api/integrations/quickbooks/export/grants/route.ts`

QB Online journal entry lines accept a `ClassRef` field. Add a `class_account_id` parameter to both export endpoints (optional), and when provided, include it in every `JournalEntryLineDetail`. Expose a "QB Class" dropdown in `QuickBooksSettings.tsx` alongside the expense and bank account selectors, filtered to accounts of type `Class`. Without this, no private foundation can use the exported entries as-is — they must manually reclassify every entry in QB, which defeats the purpose of the integration.
