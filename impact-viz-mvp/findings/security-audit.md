# Security Audit — QA Findings

Audit date: 2026-04-02
Codebase: `impact-viz-mvp` (Next.js 15 / TypeScript / Supabase)
Auditor role: Security QA — pre-production review

---

## 🔴 Critical (exploitable, data breach risk)

---

### C-1: Eight `/api/admin/` routes have zero authentication

- **Files:**
  - `app/api/admin/upload/route.ts:34` — POST, no auth
  - `app/api/admin/upload/ingest/route.ts:22` — POST, no auth
  - `app/api/admin/upload/[uploadId]/status/route.ts:17` — GET, no auth
  - `app/api/admin/upload/[uploadId]/staged-facts/route.ts:17` — GET, no auth
  - `app/api/admin/staged-facts/[factId]/approve/route.ts:17` — POST, no auth
  - `app/api/admin/staged-facts/[factId]/route.ts:17` — DELETE, no auth
  - `app/api/admin/imports/watchdog/route.ts:7` — POST, no auth
  - `app/api/admin/imports/[id]/progress/route.ts:9` — GET SSE, no auth

- **Vulnerability:** Every one of these routes initialises a Supabase *service-role* client (bypassing RLS) and immediately executes privileged operations — with no call to `auth.getUser()`, no session check, and no `requireAdmin()` guard. The Next.js middleware (`app/middleware.ts:38-40`) only protects page routes (`/dashboard/:path*`, `/admin/:path*`); it does **not** cover any `/api/` routes.

- **Attack vectors:**
  - **C-1a (Unauthenticated file upload + AI extraction):** `POST /api/admin/upload` accepts any file, runs it through OpenAI, and writes extracted facts to `staging_metric_facts` with zero credentials required.
  - **C-1b (Unauthenticated fact approval):** `POST /api/admin/staged-facts/{factId}/approve` copies any staged fact into the canonical `metric_facts` table. An attacker who previously injected staging facts (via C-1a) can self-approve them, poisoning production data.
  - **C-1c (Unauthenticated fact deletion):** `DELETE /api/admin/staged-facts/{factId}` deletes any staging row by guessing a UUID.
  - **C-1d (Unauthenticated SSE progress leak):** `GET /api/admin/imports/{id}/progress` streams live import-job progress events. No credential required; leaks job state, record counts, and error messages.
  - **C-1e (Watchdog DoS / state corruption):** `POST /api/admin/imports/watchdog` triggers the `mark_stale_import_jobs` RPC, potentially cancelling active jobs.

- **Fix:** Add a `requireAdmin()` guard (identical to the pattern in `app/api/admin/imports/[id]/route.ts:7-24`) as the very first statement in each handler. The helper must call `auth.getUser()` → check the `admins` table → return 401/403 before any service-role operations.

---

### C-2: `portfolios`, `profiles`, and `portfolio_settings` tables have NO Row Level Security

- **Files:** `db/0001_init.sql` through `db/0051_quickbooks.sql` (no migration enables RLS on these three tables)
- **Vulnerability:** A search across all 67 migration files finds zero `ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY`, zero for `profiles`, and zero for `portfolio_settings`. Because the Supabase anon key is public (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), any unauthenticated HTTP client can enumerate every portfolio name/ID, every user profile (with display name, email, linked portfolio), and every portfolio's widget/map configuration by querying Supabase directly.
- **Attack vector:** `curl 'https://<project>.supabase.co/rest/v1/portfolios?select=*' -H "apikey: <anon key>"` returns all rows. The anon key is shipped in the browser bundle.
- **Fix:** Add `ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY` with a SELECT policy that requires `auth.uid()` to be a member of the portfolio (`EXISTS (SELECT 1 FROM portfolio_members WHERE ...)`). Mirror for `profiles` (own row only) and `portfolio_settings` (portfolio membership).

---

### C-3: `staging_metric_facts` has global-read + global-insert RLS (no auth required)

- **Files:**
  - `db/0011_replace_staging_view_with_table.sql:40-44`
  - `db/0011_ensure_staging_table.sql:30-32`

- **Vulnerability:**
  ```sql
  CREATE POLICY "staging_readable"  ON public.staging_metric_facts FOR SELECT USING (true);
  CREATE POLICY "staging_insertable" ON public.staging_metric_facts FOR INSERT WITH CHECK (true);
  ```
  Both policies apply to all roles, including `anon`. Any unauthenticated user can:
  1. Read every staged AI-extracted metric fact across every portfolio.
  2. Insert arbitrary fake staging facts (which admins may then approve, poisoning `metric_facts`).

- **Fix:** Replace both policies with portfolio-membership-scoped equivalents (require `auth.uid()` to be a member of the fact's portfolio, similar to the pattern in `db/0047_import_system.sql`). Use separate `TO authenticated` clauses and never use `USING (true)` on tables that hold portfolio-specific data.

---

### C-4: `holding_contributions` anonymous full-access policy (dev policy in production)

- **File:** `db/0006_holding_contributions_policies_simple.sql:19-25`
- **Vulnerability:**
  ```sql
  -- Allow all operations for anon users (for development)
  CREATE POLICY "holding_contributions_all_anon"
  ON public.holding_contributions FOR ALL TO anon USING (true) WITH CHECK (true);
  ```
  The comment says "for development" but this migration will execute in production. PostgreSQL evaluates multiple RLS policies with OR — so even if the proper `holding_contributions_read/write` policies from `0006_holding_contributions_policies.sql` also ran, the `anon` full-access policy overrides all of them. Any unauthenticated user can read, insert, update, and delete contribution records across every portfolio.

- **Attack vector:** `curl -X DELETE '.../rest/v1/holding_contributions?portfolio_id=eq.<uuid>' -H "apikey: <anon key>"` deletes all contributions for a portfolio. No login required.
- **Fix:** Remove `0006_holding_contributions_policies_simple.sql` entirely (or drop the `anon` policy in a subsequent migration). The correct policies are already defined in `0006_holding_contributions_policies.sql`.

---

### C-5: Contact-photo upload route has no authentication

- **File:** `app/api/holdings/[id]/upload-contact-photo/route.ts:7`
- **Vulnerability:** The `POST /api/holdings/{holdingId}/upload-contact-photo` handler never calls `auth.getUser()`. It validates file type and size but then:
  1. Uploads the file to the `holdings` Supabase Storage bucket (which is PUBLIC — see H-3).
  2. Writes the resulting URL to `holdings.primary_contact_photo` via `UPDATE ... WHERE id = holdingId`. The update query uses `createSupabaseServerClient()`, which is the anon-key cookie-bound client. If the `holdings_write` RLS policy is in place, this update should be blocked for anon users — but the `holdings readable` policy from `db/0001_init.sql:82` (`USING (true)`) and the later `holdings_read` policy may coexist (PostgreSQL ORs them), meaning RLS on the write path is the only remaining guard.
- **Fix:** Add `auth.getUser()` at the top and return 401 if no session. Additionally, verify the authenticated user has `can_edit_portfolio` for the holding's portfolio.

---

## 🟡 High (hardening required before production)

---

### H-1: QuickBooks OAuth `state` parameter not HMAC-signed — CSRF risk

- **File:** `app/api/integrations/quickbooks/connect/route.ts:39-41`, `app/api/integrations/quickbooks/callback/route.ts:34-40`
- **Vulnerability:** The OAuth `state` is constructed as `base64url(JSON.stringify({ portfolioId, userId }))`. There is no nonce, no HMAC, and no server-side storage of the generated state. The callback decodes the state and verifies portfolio membership for the *current* authenticated user — but it does not verify that the state was issued by *this server* for *this session*.
- **Attack vector:** An attacker who knows a target `portfolioId` crafts `state = base64url({"portfolioId": "<victim>", "userId": "<attacker>"})` and triggers the OAuth callback URL in the victim's browser (e.g., via a CSRF-style redirect). If the victim is a portfolio member, the membership check passes and the attacker's QuickBooks `realmId` + tokens are stored against the victim's portfolio, giving the attacker ongoing read/write access through that connection.
- **Fix:** Generate a cryptographically random nonce server-side, store it in an HttpOnly cookie (or short-lived DB row) tied to the user's session, include it in the state, and verify it in the callback before accepting the code exchange.

---

### H-2: User-controlled table name in `/api/admin/import/ai/suggest` — IDOR via table injection

- **File:** `app/api/admin/import/ai/suggest/route.ts:29-51`
- **Vulnerability:** The route is under `/api/admin/` but its auth check (line 41) only confirms `user != null` — it does **not** call `requireAdmin()`. The `staging_table` value is taken from the request body (line 32) and used directly in `supabase.from(staging_table)` (line 47). Any authenticated non-admin user can:
  1. Query any table in the database by supplying an arbitrary table name (e.g., `staging_table: "tax_contributions"` or `"profiles"`).
  2. Retrieve columns `id, raw_data, transformed_data, validation_errors` from that table (column names that don't exist return nulls, not errors). The RLS on those tables will apply, but it may still expose data the user should not see via this route.
- **Fix:** (a) Add `requireAdmin()` guard. (b) Validate `staging_table` against a hardcoded allowlist of valid staging table names (`staging_import_holdings`, `staging_import_investees`, etc.) before querying.

---

### H-3: `holdings` Supabase Storage bucket is PUBLIC

- **File:** `db/0007_storage_bucket.sql:2-4`, `db/0007_storage_bucket.sql:14-19`
- **Vulnerability:**
  ```sql
  INSERT INTO storage.buckets (id, name, public) VALUES ('holdings', 'holdings', true);
  CREATE POLICY "holdings_read_public" ON storage.objects FOR SELECT TO public USING (bucket_id = 'holdings');
  ```
  The bucket is created as public and a permissive SELECT policy is applied to all roles including unauthenticated (`public`). Every contact photo, uploaded report, and any file stored in this bucket is readable by anyone with the URL. Storage URLs in Supabase are predictable (e.g., `https://<project>.supabase.co/storage/v1/object/public/holdings/contact-photos/<holdingId>-<timestamp>.<ext>`).
- **Attack vector:** Enumerate `holdingId` UUIDs (which may be obtainable via the portfolios/holdings RLS gaps above) and reconstruct photo URLs.
- **Fix:** Change the bucket to private (`public: false`), remove the `holdings_read_public` policy, and generate short-lived signed URLs server-side when serving photos to authorised users.

---

### H-4: QuickBooks OAuth tokens stored as plaintext

- **File:** `db/0051_quickbooks.sql:10-17`, `app/api/integrations/quickbooks/callback/route.ts:82-93`
- **Vulnerability:** `access_token` and `refresh_token` are stored as plain `TEXT` columns in `quickbooks_connections`. A database backup, SQL injection, or compromised Supabase project would expose live OAuth tokens granting full QuickBooks Accounting access to every connected company's financial data.
- **Fix:** Encrypt tokens at rest using a server-side encryption key (e.g., `pgcrypto` `pgp_sym_encrypt`) before storing, and decrypt on read. Alternatively, use a secrets-management service and store only an opaque reference.

---

### H-5: `admin/imports/[id]/progress` SSE endpoint has no authentication

- **File:** `app/api/admin/imports/[id]/progress/route.ts:9-24`
- **Vulnerability:** (Promoted from C-1 detail.) Any actor who knows or guesses an `import_job` UUID can subscribe to its live SSE progress stream. Events include record counts, error summaries, and status transitions. Import job UUIDs are v4 random but IDs may be leaked via other unauthenticated endpoints (e.g., C-1d, C-1e).
- **Fix:** Add `requireAdmin()` or at minimum `auth.getUser()` before calling `ImportProgressEmitter.subscribe(id)`.

---

### H-6: `admin/import/mapping-profiles` and other import sub-routes — audit for missing admin check

- **File:** `app/api/admin/import/mapping-profiles/route.ts` (not fully read but under same path pattern)
- **Vulnerability:** The sub-path `/api/admin/import/` has at least one route (`ai/suggest`) that only checks authenticated, not admin. Other routes in this path tree should be audited for the same pattern.
- **Fix:** Centralise the admin guard into a shared middleware or wrapper rather than duplicating `requireAdmin()` in each route file.

---

### H-7: Inconsistent `requireAdmin()` implementations

- **Files:** Multiple routes across `app/api/admin/`
- **Vulnerability:** There are at least two distinct admin-check patterns:
  1. `supabase.rpc('is_admin')` (e.g., `admin/portfolios/route.ts:32`, `admin/imports/[id]/ai/chat/route.ts:42`)
  2. `supabase.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()` (e.g., `admin/imports/route.ts:18-23`)
  The second pattern does NOT handle the case where `auth.getUser()` itself fails (network error etc.) — it will silently return `null` and block access, but a future refactor could introduce a vulnerability. Both patterns also omit a check that `auth.getUser()` returned a non-error result.
- **Fix:** Extract a single shared `requireAdmin(req)` function in `lib/auth.ts`, used by every admin route.

---

## 🟢 Low (best-practice improvements)

---

### L-1: `NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT` exposes an internal portfolio UUID client-side

- **File:** `.env.local:9`
- **Vulnerability:** `NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT=00000000-0000-0000-0000-000000000001` is shipped in the client JavaScript bundle. This UUID could correspond to a real demo/seed portfolio. If the `portfolios` RLS gap (C-2) is exploited, this UUID gives an attacker a known starting point to harvest data.
- **Fix:** Rename to a server-only variable (remove `NEXT_PUBLIC_` prefix) and pass the value via a server-side API call rather than embedding it in the bundle.

---

### L-2: Portfolio routes lack explicit 401 responses — silent failure on unauthenticated access

- **Files:** `app/api/portfolio/[id]/summary/route.ts`, `app/api/portfolio/[id]/meta/route.ts`, `app/api/portfolio/[id]/role/route.ts`, `app/api/portfolio/[id]/tax/export/route.ts`, and most other `app/api/portfolio/` routes
- **Vulnerability:** These routes rely entirely on Supabase RLS to enforce access. They do not call `auth.getUser()` and do not return `401 Unauthorized` if there is no session. If any RLS policy has a gap (as demonstrated in C-2, C-3, C-4), data will be returned silently to unauthenticated callers. Defence-in-depth requires an explicit auth check at the route layer.
- **Fix:** Add `auth.getUser()` at the top of each handler and return 401 before any queries if `!user`.

---

### L-3: AI summary endpoint includes portfolio ID in prompt — potential data exfiltration surface

- **File:** `app/api/portfolio/[id]/summary/route.ts:23`
- **Vulnerability:** `lines.push('Portfolio ID: ' + portfolio_id)` injects the portfolio UUID into the OpenAI prompt. While unlikely to cause direct data leakage (the LLM only sees the KPI rows fetched for that portfolio), a future change that included more data in the prompt (e.g. holdings names, contribution amounts) combined with a prompt-injection attack from a malicious KPI metric name could cause the LLM to exfiltrate data in its response. The endpoint also has no explicit auth check (see L-2).
- **Fix:** Remove the portfolio ID from the AI prompt. Add input sanitisation for any KPI values/names passed to the LLM.

---

### L-4: Live API secrets committed to working directory in `.env.local`

- **File:** `.env.local`
- **Vulnerability:** The file contains live credentials: Supabase service-role JWT, OpenAI API key (`sk-proj-...`), Anthropic API key (`sk-ant-...`), Upstash Redis token, and Google Maps API key. The `.gitignore` correctly excludes `.env.local`, so these are not currently in git history. However, if a developer accidentally commits this file (common mistake), or if CI/CD accidentally includes it, all keys are immediately exposed.
- **Fix:** Rotate all keys listed in `.env.local` before production launch. Use a secrets manager (Doppler, Vault, AWS Secrets Manager) and document that `.env.local` should never contain production credentials — use environment injection from the deployment platform instead.

---

### L-5: `holdings` RLS has two conflicting SELECT policies

- **Files:** `db/0001_init.sql:82`, `db/012_roles_and_policies.sql:44-49`
- **Vulnerability:** `0001_init.sql` creates `"holdings readable" ... USING (true)` (allows all). `012_roles_and_policies.sql` drops `holdings_read` and creates a portfolio-membership-scoped replacement — but it **does not drop `"holdings readable"`** (different policy name). In PostgreSQL, multiple permissive policies on the same table/command are ORed. The old `USING (true)` policy may still be active alongside the restrictive one, effectively allowing all users to read all holdings.
- **Fix:** Add `DROP POLICY IF EXISTS "holdings readable" ON public.holdings;` in a new migration before or alongside the restrictive policy.

---

### L-6: Viewer-role users can trigger write RPCs through AI chat

- **File:** `app/api/ai/chat/route.ts:84-106`
- **Vulnerability:** The AI chat endpoint checks portfolio membership (any role, including `viewer`) and admin status. The `ClaudePortfolioAssistant` has tools that can create/update widgets, holdings, and other entities. A `viewer`-role user who is a portfolio member can send messages that trigger write operations via the AI. The underlying RLS and `can_edit_portfolio` checks on individual tables should block the writes, but the AI may attempt destructive tool calls (e.g., `create_holding`) that silently fail without the user understanding why. More importantly, the conversational context available to the AI may include data from all of a portfolio's holdings/KPIs regardless of the user's role.
- **Fix:** In the AI chat handler, check the user's role and restrict which AI tools are available to `viewer`-role users (read-only tools only).

---

## Summary

| Severity | Count | Key issues |
|----------|-------|-----------|
| 🔴 Critical | 5 | Unauthenticated admin routes; missing RLS on portfolios/profiles; insecure staging RLS; anon write on contributions; unauthenticated file upload |
| 🟡 High | 7 | QB OAuth CSRF; table-name injection; public storage bucket; plaintext OAuth tokens; SSE no auth; inconsistent admin checks |
| 🟢 Low | 6 | Client-side UUID; silent auth failures; AI prompt exposure; live secrets in .env; duplicate RLS policies; viewer AI write access |

**Overall security assessment:** This codebase is **not production-ready**. The combination of eight admin-facing routes with no authentication, three core tables (portfolios, profiles, portfolio_settings) with no RLS, and a dev-only "allow all for anon" migration that was left in the import chain means that any anonymous HTTP client can enumerate all portfolios and users, inject fake KPI data, and approve it to production — with no credentials whatsoever. These critical issues must be resolved and re-audited before any production client data is loaded.
