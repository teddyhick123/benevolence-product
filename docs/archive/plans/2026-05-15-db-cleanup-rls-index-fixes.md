# DB Cleanup: RLS & Index Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six schema-level issues found during the prerelease DB consolidation pass: two RLS audit/security gaps, two policy correctness bugs, one missing module seed data, and one redundant generated-column index.

**Architecture:** All changes are in-place edits to existing migration files (prerelease schema — no prod instances yet). Each fix gets a contract test in `app/api/__tests__/schema-contract.test.ts` that is written first and used as the regression guard. No new migration files are created.

**Tech Stack:** PostgreSQL RLS policies (Supabase), Vitest contract tests (string/regex assertions on raw SQL text).

---

## File Map

| File | What changes |
|------|-------------|
| `app/api/__tests__/schema-contract.test.ts` | Add one `describe` block with 6 contract tests (one per fix) — written first, before any SQL edits |
| `db/migrations/0002_organizations.sql` | Tighten `org_invitations` SELECT policy to scope non-admin reads to caller's own email |
| `db/migrations/0014_donors.sql` | Add explicit `service_role` policy on `contributions_received` |
| `db/migrations/0021_composite_indexes.sql` | Replace `metric_name` with `metric_code` in the `idx_metric_facts_holding_metric_period` composite index |
| `db/migrations/0022_module_enforcement.sql` | Add missing module slugs (`grant_management`, `impact_tracking`, `analytics`, `external_data`) to the `module_definitions` seed |
| `db/migrations/0033_ai_sessions.sql` | Remove `rec_status_history_write` UPDATE policy for authenticated users |
| `db/migrations/0041_task_workflow_foundation.sql` | Change `task_events` SELECT policy from `is_org_admin` to `can_view_org` |

---

## Task 1: Add all six contract tests (write them failing first)

**Files:**
- Modify: `app/api/__tests__/schema-contract.test.ts` (append new `describe` block at end of file)

- [ ] **Step 1: Open the test file and append the new describe block**

Append this exact block to the end of `app/api/__tests__/schema-contract.test.ts`:

```typescript
describe('Schema contract: DB cleanup fixes (2026-05-15)', () => {
  it('recommendation_status_history has no UPDATE policy for authenticated users', () => {
    // rec_status_history is append-only via trigger; UPDATE access breaks audit integrity
    expect(migrationsSrc).not.toMatch(
      /CREATE\s+POLICY\s+["']rec_status_history_write["']\s+ON\s+public\.recommendation_status_history\s+FOR\s+UPDATE\s+TO\s+authenticated/i
    );
  });

  it('org_invitations read policy requires caller email match for non-admin access', () => {
    // Without this, any authenticated user can enumerate pending invitations for any org
    expect(migrationsSrc).toMatch(
      /CREATE\s+POLICY\s+"org_invitations: anyone can read by token"[\s\S]{0,500}auth\.jwt\(\)\s*->>\s*'email'/
    );
  });

  it('module_definitions seeds include all active module slugs', () => {
    // grant_management, impact_tracking, analytics, external_data were missing
    expect(migrationsSrc).toMatch(/'grant_management'/);
    expect(migrationsSrc).toMatch(/'impact_tracking'/);
    expect(migrationsSrc).toMatch(/'analytics'/);
    expect(migrationsSrc).toMatch(/'external_data'/);
  });

  it('task_events are viewable by org members, not only admins', () => {
    // Regular members need event visibility for tasks assigned to them
    expect(migrationsSrc).not.toMatch(
      /CREATE\s+POLICY\s+"task_events: org admins can view"\s+ON\s+public\.task_events\s+FOR\s+SELECT\s+USING\s*\(\s*public\.is_org_admin/i
    );
    expect(migrationsSrc).toMatch(
      /CREATE\s+POLICY\s+"task_events: org members can view"/
    );
  });

  it('metric_facts composite index uses metric_code, not the generated metric_name alias', () => {
    // metric_name is GENERATED ALWAYS AS (metric_code); index should use the real column
    expect(migrationsSrc).not.toMatch(
      /idx_metric_facts_holding_metric_period[\s\S]{0,300}metric_name/
    );
    expect(migrationsSrc).toMatch(
      /idx_metric_facts_holding_metric_period[\s\S]{0,300}metric_code/
    );
  });

  it('contributions_received has an explicit service_role policy', () => {
    // Every other table has one; consistency prevents surprises in service-client code
    expect(migrationsSrc).toMatch(
      /ON\s+(?:public\.)?contributions_received\s+FOR\s+ALL\s+TO\s+service_role/i
    );
  });
});
```

- [ ] **Step 2: Run the tests to confirm all six fail**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | tail -40
```

Expected: 6 failures in the `DB cleanup fixes` describe block. The existing tests must still pass — if any pre-existing test fails, stop and investigate before continuing.

- [ ] **Step 3: Commit the failing tests**

```bash
git add app/api/__tests__/schema-contract.test.ts
git commit -m "test: add contract guards for DB cleanup RLS and index fixes"
```

---

## Task 2: Fix `rec_status_history_write` — remove UPDATE policy for authenticated

**Files:**
- Modify: `db/migrations/0033_ai_sessions.sql` (around line 360)

**Context:** `recommendation_status_history` is an audit table written exclusively by the `log_recommendation_status_change` trigger (which is `SECURITY DEFINER`). The existing `FOR UPDATE TO authenticated` policy lets any portfolio member retroactively edit history rows. The `service_role` policy (line 380) already covers all internal writes.

- [ ] **Step 1: Remove the UPDATE policy block from 0033**

Locate and remove these lines in `db/migrations/0033_ai_sessions.sql`:

```sql
CREATE POLICY "rec_status_history_write" ON public.recommendation_status_history
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_status_history.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolio_recommendations r
      WHERE r.id = recommendation_status_history.recommendation_id
        AND public.can_view_portfolio(r.portfolio_id)
    )
  );
```

The `GRANT SELECT ON public.recommendation_status_history TO authenticated;` line at the end of the file (line 390) is correct and stays — authenticated users can still read history, they just cannot modify it.

- [ ] **Step 2: Run tests to confirm fix 1 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "rec_status_history"
```

Expected: `✓ recommendation_status_history has no UPDATE policy for authenticated users`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0033_ai_sessions.sql
git commit -m "fix: remove writable UPDATE policy from append-only recommendation_status_history"
```

---

## Task 3: Fix `org_invitations` SELECT policy — scope to caller's email

**Files:**
- Modify: `db/migrations/0002_organizations.sql` (around line 181)

**Context:** The current policy lets any authenticated user read any pending invitation just by knowing it exists. Adding `email = (auth.jwt() ->> 'email')` limits non-admin reads to the invitee's own record. Admins still see all invitations through the `org_invitations: admins can manage` FOR ALL policy (line 177).

- [ ] **Step 1: Replace the over-broad SELECT policy in 0002**

Find this block in `db/migrations/0002_organizations.sql`:

```sql
CREATE POLICY "org_invitations: anyone can read by token"
  ON org_invitations FOR SELECT
  USING (expires_at > now() AND accepted_at IS NULL AND status = 'pending');
```

Replace it with:

```sql
CREATE POLICY "org_invitations: anyone can read by token"
  ON org_invitations FOR SELECT
  USING (
    expires_at > now()
    AND accepted_at IS NULL
    AND status = 'pending'
    AND email = (auth.jwt() ->> 'email')
  );
```

- [ ] **Step 2: Run tests to confirm fix 2 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "org_invitations read policy"
```

Expected: `✓ org_invitations read policy requires caller email match for non-admin access`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0002_organizations.sql
git commit -m "fix: scope org_invitations read policy to caller's own email"
```

---

## Task 4: Fix `module_definitions` seed — add missing module slugs

**Files:**
- Modify: `db/migrations/0022_module_enforcement.sql` (around line 20)

**Context:** The seed currently covers only 8 slugs. Missing: `grant_management`, `impact_tracking`, `analytics`, `external_data`. Without these rows, `v_org_modules`, `org_enabled_modules()`, and the `validate_org_modules` trigger are all unaware of these features. The `pledges` slug is correctly seeded in 0038, so it stays there.

- [ ] **Step 1: Add the missing slugs to the INSERT in 0022**

Find the INSERT block in `db/migrations/0022_module_enforcement.sql` (it starts with `INSERT INTO module_definitions (slug, label, description, depends_on, is_core) VALUES`).

Add these four rows before the closing `ON CONFLICT` clause (after the last existing row — add a comma to the previous last row):

```sql
  ('grant_management', 'Grant Management',  'Due diligence workflows, payments, and grantee reporting', NULL, false),
  ('impact_tracking',  'Impact Tracking',   'KPIs, metrics, and impact visualizations at the holding level', NULL, false),
  ('analytics',        'Analytics',         'Projections, benchmarks, risk scoring, and AI insights', ARRAY['impact_tracking'], false),
  ('external_data',    'External Data',     'Charity Navigator, Candid, and news integrations', NULL, false)
```

The full INSERT block should look like:

```sql
INSERT INTO module_definitions (slug, label, description, depends_on, is_core) VALUES
  ('portfolio',        'Portfolio Management', 'Core holdings and investment tracking', NULL, true),
  ('donors',           'Donor CRM',            'Donor management, contributions, acknowledgment letters', NULL, false),
  ('tax',              'Tax Center',           'Tax deduction tracking, Form 8283, carryforward analysis', ARRAY['portfolio'], false),
  ('compliance',       'Compliance',           'Filing calendar and state charitable registrations', NULL, false),
  ('quickbooks',       'QuickBooks Sync',      'QuickBooks Online integration for financial sync', ARRAY['portfolio'], false),
  ('import',           'Data Import',          'AI-assisted data import from Blackbaud and other systems', NULL, false),
  ('reports',          'Reports',              'Shareable impact and portfolio reports', ARRAY['portfolio'], false),
  ('ai_assistant',     'AI Assistant',         'Claude AI portfolio advisor and action executor', ARRAY['portfolio'], false),
  ('grant_management', 'Grant Management',     'Due diligence workflows, payments, and grantee reporting', NULL, false),
  ('impact_tracking',  'Impact Tracking',      'KPIs, metrics, and impact visualizations at the holding level', NULL, false),
  ('analytics',        'Analytics',            'Projections, benchmarks, risk scoring, and AI insights', ARRAY['impact_tracking'], false),
  ('external_data',    'External Data',        'Charity Navigator, Candid, and news integrations', NULL, false)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  depends_on  = EXCLUDED.depends_on,
  is_core     = EXCLUDED.is_core;
```

- [ ] **Step 2: Run tests to confirm fix 3 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "module_definitions seeds"
```

Expected: `✓ module_definitions seeds include all active module slugs`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0022_module_enforcement.sql
git commit -m "fix: add missing module slugs to module_definitions seed (grant_management, impact_tracking, analytics, external_data)"
```

---

## Task 5: Fix `task_events` SELECT policy — allow all org members

**Files:**
- Modify: `db/migrations/0041_task_workflow_foundation.sql` (around line 625)

**Context:** The current policy restricts `task_events` reads to org admins only. Regular members can't see events on their own assigned tasks, which breaks task history visibility for non-admins. The write path (service_role only) stays unchanged.

- [ ] **Step 1: Replace the task_events SELECT policy in 0041**

Find this block in `db/migrations/0041_task_workflow_foundation.sql`:

```sql
DROP POLICY IF EXISTS "task_events: org admins can view" ON public.task_events;
CREATE POLICY "task_events: org admins can view"
  ON public.task_events FOR SELECT
  USING (public.is_org_admin(org_id));
```

Replace it with:

```sql
DROP POLICY IF EXISTS "task_events: org admins can view" ON public.task_events;
DROP POLICY IF EXISTS "task_events: org members can view" ON public.task_events;
CREATE POLICY "task_events: org members can view"
  ON public.task_events FOR SELECT
  USING (public.can_view_org(org_id));
```

- [ ] **Step 2: Run tests to confirm fix 4 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "task_events are viewable"
```

Expected: `✓ task_events are viewable by org members, not only admins`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0041_task_workflow_foundation.sql
git commit -m "fix: broaden task_events SELECT policy from org admins to all org members"
```

---

## Task 6: Fix composite index — replace `metric_name` with `metric_code`

**Files:**
- Modify: `db/migrations/0021_composite_indexes.sql` (around line 56)

**Context:** `metric_name` is `GENERATED ALWAYS AS (metric_code) STORED` — it always equals `metric_code`. Indexing the generated alias is redundant and fragile (the planner may not unify them for query rewriting). The real column is `metric_code`.

- [ ] **Step 1: Replace the index definition in 0021**

Find this block in `db/migrations/0021_composite_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_metric_facts_holding_metric_period
  ON metric_facts (holding_id, metric_name, period_end DESC);
```

Replace it with:

```sql
CREATE INDEX IF NOT EXISTS idx_metric_facts_holding_metric_period
  ON metric_facts (holding_id, metric_code, period_end DESC);
```

- [ ] **Step 2: Run tests to confirm fix 5 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "metric_facts composite index"
```

Expected: `✓ metric_facts composite index uses metric_code, not the generated metric_name alias`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0021_composite_indexes.sql
git commit -m "fix: use metric_code (not generated metric_name alias) in composite metric_facts index"
```

---

## Task 7: Add explicit `service_role` policy to `contributions_received`

**Files:**
- Modify: `db/migrations/0014_donors.sql` (after existing RLS policies, around line 255)

**Context:** Service role bypasses RLS by default in Supabase, so this is not a security bug — it's an internal consistency issue. Every other table in the schema has an explicit service_role policy, making policy audits easier and preventing surprises if Supabase ever changes its bypass defaults.

- [ ] **Step 1: Add the service_role policy in 0014**

Find the end of the RLS block for `contributions_received` in `db/migrations/0014_donors.sql`. After the last existing policy on `contributions_received`:

```sql
CREATE POLICY "contributions_received: org members (member+) can manage"
  ON contributions_received FOR ALL
  USING (can_edit_org(org_id) AND org_has_module(org_id, 'donors'))
  WITH CHECK (can_edit_org(org_id) AND org_has_module(org_id, 'donors'));
```

Add immediately after:

```sql
CREATE POLICY "contributions_received: service role"
  ON contributions_received FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Run tests to confirm fix 6 passes**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts --reporter=verbose 2>&1 | grep -A3 "contributions_received has"
```

Expected: `✓ contributions_received has an explicit service_role policy`

- [ ] **Step 3: Confirm all tests pass (full suite)**

```bash
npx vitest run app/api/__tests__/schema-contract.test.ts lib/__tests__/task-workflow-schema-contract.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass. 0 failures.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0014_donors.sql
git commit -m "fix: add explicit service_role policy to contributions_received for consistency"
```

---

## Self-Review

**Spec coverage check:**
- [x] Fix 1 (rec_status_history UPDATE policy removed) → Task 2
- [x] Fix 2 (org_invitations email scope) → Task 3
- [x] Fix 3 (module_definitions missing slugs) → Task 4
- [x] Fix 4 (task_events too restrictive) → Task 5
- [x] Fix 5 (metric_name → metric_code) → Task 6
- [x] Fix 6 (contributions_received service_role) → Task 7
- [x] Contract tests written before SQL edits → Task 1

**Placeholder scan:** No TBDs, no "similar to above", all code blocks complete.

**Type consistency:** No cross-task type references; all changes are self-contained SQL edits.
