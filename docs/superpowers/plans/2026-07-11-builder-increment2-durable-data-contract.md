# Builder Increment 2 — Durable Data Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Builder code-proposal run traceable to one immutable proposal revision and one review attempt, per Phase 1 of `docs/BUILDER_REVIEW_ORCHESTRATION_AUDIT.md`.

**Architecture:** Consolidate the prerelease Builder schema (fold `0026` into a rewritten canonical `0025`), add five orchestration tables (`builder_proposal_revisions`, `builder_review_attempts`, `builder_verification_runs`, `builder_review_findings`, `builder_delivery_records`) plus a private `builder-artifacts` storage bucket, replace the `status`+`phase` overload with one `code_state` state machine driven by a single transition service (`lib/builder/proposal-state.ts`), migrate the worker/routes/UI off the `generated_code`/`review_report`/`phase`/`pr_url` JSONB fields, and remove those fields and the `proposal-lifecycle.ts` compatibility mapper entirely. No two sources of truth.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS + Storage), BullMQ worker, Vitest 4, `node:crypto` SHA-256.

## Context

Increment 1 (Phase 0 release gate) merged 2026-07-10. Today everything lives on the single `builder_proposals` row: review results are one `review_report` JSONB column overwritten last-write-wins, code lives in `generated_code` JSONB, base SHA is read at apply time and discarded (`lib/builder/github-apply.ts:60-66`), and the state machine is a free-text `phase` column with no CHECK, interpreted by the derivation mapper `lib/builder/proposal-lifecycle.ts`. The audit (lines 114-131, 152-162) requires immutable revisions, attempt history, typed findings, provider delivery facts, and a summary/detail API — with the transitional fields removed in the same prerelease consolidation.

**Adopted design decisions** (recommendations from design review; flag to the user only if implementation contradicts them):
1. Fold `organizations.ai_instructions` into `0002_organizations.sql`; delete `0026_builder_enhancement.sql` (numbering gap is fine — `scripts/migrate-client.ts` `discoverMigrations` just sorts).
2. Claim atomicity via a plpgsql `SECURITY DEFINER` RPC `builder_claim_code_run` (precedent: `0047_grant_lifecycle_transition_rpc.sql`).
3. Per-file generation progress lives in `builder_proposal_revisions.progress` JSONB, writable only before the first review attempt (immutability trigger allows it pre-attempt).
4. `config_patch` stays inline in the list response (it is configuration, not source code).
5. If `base_commit_sha` was never captured at claim (GitHub unreadable), capture it at apply time, stamp it, and proceed. Increment 3 hardens this.
6. Admin PATCH on code proposals allows only `rejected` (via the state service, with `rejected_reason`); config proposals keep their `status` flow.
7. Include the env-gated live RLS suite now (`BUILDER_DB_TESTS=1`), skipped by default in CI.

## Global Constraints

- **Fresh-reset requirement:** rewriting `0025` and deleting `0026` will not re-apply onto existing dev DBs (no migrations ledger; `IF NOT EXISTS` no-ops). All dev/preview instances must be reset from canonical `db/migrations`. In-flight proposals are lost — acceptable prerelease; state this in the PR body.
- **Single-PR cutover:** Tasks 1–4 are standalone-green; Tasks 5–10 are a coordinated cutover. Unit tests mock supabase so CI stays green per task, but the branch merges as ONE PR. Never merge Task 1 alone.
- `org_id` (never `organization_id`); RLS helpers `is_org_admin`, `can_view_org`; writes to orchestration tables are service-role only (`createAdminClient()`), matching `0044_builder_events.sql` style.
- Score is never an authorization signal. The gate is fail-closed: absence of evidence blocks.
- `organizations.ai_instructions` is used beyond Builder and MUST survive.
- Policy versions: `PROPOSAL_STATE_POLICY_VERSION = 'builder-state/v1'`, `REVIEW_POLICY_VERSION = 'builder-review-policy/v1'` with `REQUIRED_CHECK_KEYS: string[] = []` (Increment 3 ships `v2` with populated keys; stale-version attempts then fail the gate automatically).
- Test framework: Vitest 4 (`npm run test:run`), `// @vitest-environment node`, hand-rolled supabase mocks per existing `app/api/__tests__/builder-*.test.ts` style.
- Verification before completion: `npx vitest run`, `npx tsc --noEmit`, and the grep guard in Task 11 must all pass.

---

### Task 1: Canonical Builder schema (rewrite 0025, delete 0026, fold ai_instructions into 0002)

**Files:**
- Modify: `db/migrations/0002_organizations.sql` (add `ai_instructions TEXT` to the `organizations` CREATE TABLE column list)
- Rewrite: `db/migrations/0025_builder.sql`
- Delete: `db/migrations/0026_builder_enhancement.sql`
- Test: `app/api/__tests__/builder-schema-contract.test.ts` (new)
- Test: `app/api/__tests__/builder-rls.live.test.ts` (new, env-gated)

**Interfaces:**
- Produces: tables `builder_proposals` (with `code_state`, `current_revision_id`, `rejected_reason`, WITHOUT `generated_code`/`review_report`/`phase`/`pr_url`), `builder_proposal_revisions`, `builder_review_attempts`, `builder_verification_runs`, `builder_review_findings`, `builder_delivery_records`; RPC `builder_claim_code_run(p_proposal_id uuid, p_org_id uuid, p_actor uuid)`; trigger fn `builder_revision_immutability_guard()`; bucket `builder-artifacts`.

- [ ] **Step 1: Write the failing schema-contract test**

Create `app/api/__tests__/builder-schema-contract.test.ts`. Follow the block-extraction style of the existing `app/api/__tests__/schema-contract.test.ts` (`extractCreatedRelations`): read `db/migrations/0025_builder.sql`, extract each `CREATE TABLE` body, and assert structurally (not substring-greps of the whole file):

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');
const sql = readFileSync(path.join(MIGRATIONS_DIR, '0025_builder.sql'), 'utf8');

/** Extract the body of `CREATE TABLE [IF NOT EXISTS] <name> ( ... );` */
function tableBody(name: string): string {
  const re = new RegExp(
    `CREATE TABLE IF NOT EXISTS (?:public\\.)?${name}\\s*\\(([\\s\\S]*?)\\n\\);`, 'm');
  const m = sql.match(re);
  if (!m) throw new Error(`table ${name} not found in 0025`);
  return m[1];
}

describe('0025 canonical builder schema', () => {
  it('builder_proposals has code_state with the 11-state CHECK and no transitional fields', () => {
    const body = tableBody('builder_proposals');
    for (const s of ['plan_ready','queued','generating','verifying','needs_repair',
                     'ready_to_apply','pr_opened','merged','deployed','rejected','failed']) {
      expect(body).toContain(`'${s}'`);
    }
    expect(body).toMatch(/current_revision_id\s+uuid/);
    expect(body).toMatch(/rejected_reason\s+text/);
    for (const dead of ['generated_code','review_report','pr_url']) {
      expect(body).not.toContain(dead);
    }
    expect(body).not.toMatch(/\bphase\b/);
    // type/state consistency constraint
    expect(body).toMatch(/proposal_type = 'config' AND status IS NOT NULL AND code_state IS NULL/);
    expect(body).toMatch(/proposal_type = 'code' AND code_state IS NOT NULL/);
  });

  it.each([
    ['builder_proposal_revisions', ['proposal_id','revision_number','parent_revision_id','kind',
      'base_commit_sha','head_commit_sha','manifest_hash','diff_hash','context_hash',
      'artifact_prefix','file_count','total_bytes','progress','created_by']],
    ['builder_review_attempts', ['proposal_id','revision_id','attempt_number','trigger','status',
      'policy_version','required_check_keys','summary_score','started_at','completed_at','decision_reason']],
    ['builder_verification_runs', ['review_attempt_id','check_key','command_version','status',
      'exit_code','duration_ms','log_artifact_key','evidence_hash']],
    ['builder_review_findings', ['review_attempt_id','reviewer_kind','severity','category','rule_id',
      'file_path','line_start','line_end','evidence','recommendation','state']],
    ['builder_delivery_records', ['proposal_id','revision_id','provider','pr_number','pr_url',
      'branch_name','commit_sha','environment','status','provider_event_id','payload_hash']],
  ])('%s has required columns', (table, cols) => {
    const body = tableBody(table);
    for (const col of cols) expect(body).toMatch(new RegExp(`\\b${col}\\b`));
  });

  it('enum CHECKs are exact', () => {
    expect(tableBody('builder_proposal_revisions'))
      .toMatch(/kind IN \('scaffold_generation','generic_submission','repair','rebase'\)/);
    expect(tableBody('builder_review_attempts'))
      .toMatch(/trigger IN \('initial','retry','repair','rebase','policy_change'\)/);
    expect(tableBody('builder_review_attempts'))
      .toMatch(/status IN \('running','passed','blocked','failed'\)/);
    expect(tableBody('builder_verification_runs'))
      .toMatch(/status IN \('pending','running','passed','failed','error','skipped'\)/);
    expect(tableBody('builder_review_findings'))
      .toMatch(/severity IN \('blocker','error','warning','info'\)/);
    expect(tableBody('builder_review_findings'))
      .toMatch(/state IN \('open','resolved','dismissed'\)/);
    expect(tableBody('builder_delivery_records'))
      .toMatch(/status IN \('pr_open','pr_closed','pr_merged','deploy_pending','deploy_succeeded','deploy_failed'\)/);
  });

  it('every builder table enables RLS with org-admin read + service-role policies', () => {
    for (const t of ['builder_proposals','builder_sessions','builder_proposal_revisions',
                     'builder_review_attempts','builder_verification_runs',
                     'builder_review_findings','builder_delivery_records']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE (?:public\\.)?${t} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`"${t}: service role"`));
    }
    // child tables authorize via inner join to builder_proposals.org_id
    expect(sql).toMatch(/p\.id = proposal_id AND public\.is_org_admin\(p\.org_id\)/);
  });

  it('has immutability trigger, claim RPC, circular FK, and artifact bucket', () => {
    expect(sql).toContain('builder_revision_immutability_guard');
    expect(sql).toContain('builder_claim_code_run');
    expect(sql).toMatch(/ADD CONSTRAINT builder_proposals_current_revision_fkey/);
    expect(sql).toMatch(/ON DELETE SET NULL/);
    expect(sql).toMatch(/'builder-artifacts'.*false|\('builder-artifacts',\s*'builder-artifacts',\s*false\)/s);
  });
});

describe('migration set hygiene', () => {
  it('0026 is deleted and no migration re-adds transitional columns', () => {
    expect(existsSync(path.join(MIGRATIONS_DIR, '0026_builder_enhancement.sql'))).toBe(false);
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f));
    for (const f of all) {
      const text = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      expect(text, f).not.toMatch(/ALTER TABLE (?:public\.)?builder_proposals\s+ADD COLUMN/i);
    }
  });

  it('ai_instructions lives in 0002_organizations.sql', () => {
    const org = readFileSync(path.join(MIGRATIONS_DIR, '0002_organizations.sql'), 'utf8');
    expect(org).toMatch(/ai_instructions\s+TEXT/i);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run app/api/__tests__/builder-schema-contract.test.ts`
Expected: FAIL (`code_state` not found, 0026 still exists, etc.)

- [ ] **Step 3: Fold `ai_instructions` into 0002**

In `db/migrations/0002_organizations.sql`, add to the `organizations` CREATE TABLE column list (near other nullable text columns):

```sql
  ai_instructions   TEXT,
```

- [ ] **Step 4: Rewrite `db/migrations/0025_builder.sql`**

Full canonical content (keep the existing `builder_sessions` block verbatim from the current file — table, index, RLS, grants, `set_builder_sessions_updated_at` trigger):

```sql
-- db/migrations/0025_builder.sql
-- Canonical Builder schema: proposals, sessions, and the durable orchestration
-- contract (revisions, review attempts, verification runs, findings, delivery).
-- Consolidates the former 0026_builder_enhancement.sql per the prerelease
-- schema policy. All orchestration writes are service-role only.

-- ============================================================
-- 1. builder_proposals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_proposals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by        uuid NOT NULL REFERENCES auth.users(id),
  request_text        text NOT NULL,
  proposal_type       text NOT NULL CHECK (proposal_type IN ('config','code')),
  -- config proposals only:
  status              text CHECK (status IN ('pending','approved','rejected','applied')),
  config_patch        jsonb,
  -- code proposals only (canonical state model, audit lines 94-112):
  code_state          text CHECK (code_state IN (
                        'plan_ready','queued','generating','verifying','needs_repair',
                        'ready_to_apply','pr_opened','merged','deployed','rejected','failed')),
  current_revision_id uuid,  -- FK added after builder_proposal_revisions exists
  plan_content        jsonb,
  rejected_reason     text,
  reviewer_notes      text,
  reviewed_by         uuid REFERENCES auth.users(id),
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT builder_proposals_type_state CHECK (
    (proposal_type = 'config' AND status IS NOT NULL AND code_state IS NULL)
    OR (proposal_type = 'code' AND code_state IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS builder_proposals_org_status_idx
  ON public.builder_proposals (org_id, status);
CREATE INDEX IF NOT EXISTS builder_proposals_org_code_state_idx
  ON public.builder_proposals (org_id, code_state);
CREATE INDEX IF NOT EXISTS builder_proposals_code_state_created_idx
  ON public.builder_proposals (code_state, created_at DESC);

DROP TRIGGER IF EXISTS set_builder_proposals_updated_at ON public.builder_proposals;
CREATE TRIGGER set_builder_proposals_updated_at
  BEFORE UPDATE ON public.builder_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.builder_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "builder_proposals: org admins read" ON public.builder_proposals;
CREATE POLICY "builder_proposals: org admins read" ON public.builder_proposals
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
DROP POLICY IF EXISTS "builder_proposals: service role" ON public.builder_proposals;
CREATE POLICY "builder_proposals: service role" ON public.builder_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.builder_proposals TO authenticated;
GRANT ALL ON public.builder_proposals TO service_role;

-- ============================================================
-- 2. builder_sessions  (unchanged from previous 0025 — copy verbatim)
-- ============================================================
-- ... existing builder_sessions table, index, RLS, grants, trigger ...

-- ============================================================
-- 3. builder_proposal_revisions — immutable code snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_proposal_revisions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id        uuid NOT NULL REFERENCES public.builder_proposals(id) ON DELETE CASCADE,
  revision_number    int  NOT NULL,
  parent_revision_id uuid REFERENCES public.builder_proposal_revisions(id),
  kind               text NOT NULL CHECK (kind IN ('scaffold_generation','generic_submission','repair','rebase')),
  base_commit_sha    text,
  head_commit_sha    text,
  manifest_hash      text,
  diff_hash          text,
  context_hash       text,
  artifact_prefix    text NOT NULL,
  file_count         int,
  total_bytes        int,
  progress           jsonb,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, revision_number)
);

CREATE INDEX IF NOT EXISTS builder_proposal_revisions_proposal_idx
  ON public.builder_proposal_revisions (proposal_id, revision_number DESC);

ALTER TABLE public.builder_proposals
  DROP CONSTRAINT IF EXISTS builder_proposals_current_revision_fkey;
ALTER TABLE public.builder_proposals
  ADD CONSTRAINT builder_proposals_current_revision_fkey
  FOREIGN KEY (current_revision_id)
  REFERENCES public.builder_proposal_revisions(id) ON DELETE SET NULL;

DROP TRIGGER IF EXISTS set_builder_proposal_revisions_updated_at ON public.builder_proposal_revisions;
CREATE TRIGGER set_builder_proposal_revisions_updated_at
  BEFORE UPDATE ON public.builder_proposal_revisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.builder_proposal_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_proposal_revisions: org admins read" ON public.builder_proposal_revisions;
CREATE POLICY "builder_proposal_revisions: org admins read" ON public.builder_proposal_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.builder_proposals p
                 WHERE p.id = proposal_id AND public.is_org_admin(p.org_id)));
DROP POLICY IF EXISTS "builder_proposal_revisions: service role" ON public.builder_proposal_revisions;
CREATE POLICY "builder_proposal_revisions: service role" ON public.builder_proposal_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.builder_proposal_revisions TO authenticated;
GRANT ALL ON public.builder_proposal_revisions TO service_role;

-- Immutability: once a review attempt exists for a revision, its identity
-- fields are frozen. head_commit_sha may be stamped once (NULL -> value).
CREATE OR REPLACE FUNCTION public.builder_revision_immutability_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.builder_review_attempts a WHERE a.revision_id = OLD.id) THEN
    IF NEW.kind               IS DISTINCT FROM OLD.kind
       OR NEW.parent_revision_id IS DISTINCT FROM OLD.parent_revision_id
       OR NEW.revision_number IS DISTINCT FROM OLD.revision_number
       OR NEW.artifact_prefix IS DISTINCT FROM OLD.artifact_prefix
       OR NEW.manifest_hash   IS DISTINCT FROM OLD.manifest_hash
       OR NEW.diff_hash       IS DISTINCT FROM OLD.diff_hash
       OR NEW.context_hash    IS DISTINCT FROM OLD.context_hash
       OR NEW.base_commit_sha IS DISTINCT FROM OLD.base_commit_sha
       OR NEW.progress        IS DISTINCT FROM OLD.progress
    THEN
      RAISE EXCEPTION 'builder_revision_immutable: revision % has review attempts', OLD.id
        USING ERRCODE = 'P0031';
    END IF;
  END IF;
  IF OLD.head_commit_sha IS NOT NULL
     AND NEW.head_commit_sha IS DISTINCT FROM OLD.head_commit_sha THEN
    RAISE EXCEPTION 'builder_revision_immutable: head_commit_sha already stamped on %', OLD.id
      USING ERRCODE = 'P0031';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS builder_proposal_revisions_immutability ON public.builder_proposal_revisions;
CREATE TRIGGER builder_proposal_revisions_immutability
  BEFORE UPDATE ON public.builder_proposal_revisions
  FOR EACH ROW EXECUTE FUNCTION public.builder_revision_immutability_guard();

-- ============================================================
-- 4. builder_review_attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_review_attempts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id         uuid NOT NULL REFERENCES public.builder_proposals(id) ON DELETE CASCADE,
  revision_id         uuid NOT NULL REFERENCES public.builder_proposal_revisions(id) ON DELETE CASCADE,
  attempt_number      int  NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('initial','retry','repair','rebase','policy_change')),
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','blocked','failed')),
  policy_version      text NOT NULL,
  required_check_keys text[] NOT NULL DEFAULT '{}',
  summary_score       int,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  decision_reason     text,
  UNIQUE (revision_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS builder_review_attempts_proposal_idx
  ON public.builder_review_attempts (proposal_id, started_at DESC);
CREATE INDEX IF NOT EXISTS builder_review_attempts_revision_idx
  ON public.builder_review_attempts (revision_id, attempt_number DESC);

ALTER TABLE public.builder_review_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_review_attempts: org admins read" ON public.builder_review_attempts;
CREATE POLICY "builder_review_attempts: org admins read" ON public.builder_review_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.builder_proposals p
                 WHERE p.id = proposal_id AND public.is_org_admin(p.org_id)));
DROP POLICY IF EXISTS "builder_review_attempts: service role" ON public.builder_review_attempts;
CREATE POLICY "builder_review_attempts: service role" ON public.builder_review_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.builder_review_attempts TO authenticated;
GRANT ALL ON public.builder_review_attempts TO service_role;

-- ============================================================
-- 5. builder_verification_runs  (populated by Increment 3's sandbox verifier)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_verification_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_attempt_id uuid NOT NULL REFERENCES public.builder_review_attempts(id) ON DELETE CASCADE,
  check_key         text NOT NULL,
  command_version   text,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','passed','failed','error','skipped')),
  exit_code         int,
  duration_ms       int,
  log_artifact_key  text,
  evidence_hash     text,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_attempt_id, check_key)
);

CREATE INDEX IF NOT EXISTS builder_verification_runs_attempt_idx
  ON public.builder_verification_runs (review_attempt_id);

ALTER TABLE public.builder_verification_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_verification_runs: org admins read" ON public.builder_verification_runs;
CREATE POLICY "builder_verification_runs: org admins read" ON public.builder_verification_runs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.builder_review_attempts a
                 JOIN public.builder_proposals p ON p.id = a.proposal_id
                 WHERE a.id = review_attempt_id AND public.is_org_admin(p.org_id)));
DROP POLICY IF EXISTS "builder_verification_runs: service role" ON public.builder_verification_runs;
CREATE POLICY "builder_verification_runs: service role" ON public.builder_verification_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.builder_verification_runs TO authenticated;
GRANT ALL ON public.builder_verification_runs TO service_role;

-- ============================================================
-- 6. builder_review_findings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_review_findings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_attempt_id uuid NOT NULL REFERENCES public.builder_review_attempts(id) ON DELETE CASCADE,
  reviewer_kind     text NOT NULL CHECK (reviewer_kind IN
                      ('automated_review','security_data','integration_architecture',
                       'product_test','deterministic_check','system')),
  severity          text NOT NULL CHECK (severity IN ('blocker','error','warning','info')),
  category          text,
  rule_id           text,
  file_path         text,
  line_start        int,
  line_end          int,
  evidence          text NOT NULL,
  recommendation    text,
  state             text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','dismissed')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS builder_review_findings_attempt_idx
  ON public.builder_review_findings (review_attempt_id, state, severity);

ALTER TABLE public.builder_review_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_review_findings: org admins read" ON public.builder_review_findings;
CREATE POLICY "builder_review_findings: org admins read" ON public.builder_review_findings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.builder_review_attempts a
                 JOIN public.builder_proposals p ON p.id = a.proposal_id
                 WHERE a.id = review_attempt_id AND public.is_org_admin(p.org_id)));
DROP POLICY IF EXISTS "builder_review_findings: service role" ON public.builder_review_findings;
CREATE POLICY "builder_review_findings: service role" ON public.builder_review_findings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.builder_review_findings TO authenticated;
GRANT ALL ON public.builder_review_findings TO service_role;

-- ============================================================
-- 7. builder_delivery_records — provider facts, not user assertions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.builder_delivery_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       uuid NOT NULL REFERENCES public.builder_proposals(id) ON DELETE CASCADE,
  revision_id       uuid NOT NULL REFERENCES public.builder_proposal_revisions(id),
  provider          text NOT NULL CHECK (provider IN ('github','vercel')),
  pr_number         int,
  pr_url            text,
  branch_name       text,
  commit_sha        text,
  environment       text,
  status            text NOT NULL CHECK (status IN
                      ('pr_open','pr_closed','pr_merged','deploy_pending','deploy_succeeded','deploy_failed')),
  provider_event_id text,
  payload_hash      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS builder_delivery_records_proposal_idx
  ON public.builder_delivery_records (proposal_id, created_at DESC);

DROP TRIGGER IF EXISTS set_builder_delivery_records_updated_at ON public.builder_delivery_records;
CREATE TRIGGER set_builder_delivery_records_updated_at
  BEFORE UPDATE ON public.builder_delivery_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.builder_delivery_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_delivery_records: org admins read" ON public.builder_delivery_records;
CREATE POLICY "builder_delivery_records: org admins read" ON public.builder_delivery_records
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.builder_proposals p
                 WHERE p.id = proposal_id AND public.is_org_admin(p.org_id)));
DROP POLICY IF EXISTS "builder_delivery_records: service role" ON public.builder_delivery_records;
CREATE POLICY "builder_delivery_records: service role" ON public.builder_delivery_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT ON public.builder_delivery_records TO authenticated;
GRANT ALL ON public.builder_delivery_records TO service_role;

-- ============================================================
-- 8. Atomic claim RPC (precedent: 0047_grant_lifecycle_transition_rpc.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.builder_claim_code_run(
  p_proposal_id uuid,
  p_org_id      uuid,
  p_actor       uuid
) RETURNS TABLE (revision_id uuid, reused boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proposal public.builder_proposals%ROWTYPE;
  v_next_rev int;
  v_rev_id   uuid;
BEGIN
  SELECT * INTO v_proposal FROM public.builder_proposals
   WHERE id = p_proposal_id AND org_id = p_org_id AND proposal_type = 'code'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'builder_claim_not_found' USING ERRCODE = 'P0032';
  END IF;
  IF v_proposal.code_state NOT IN ('plan_ready','needs_repair','failed') THEN
    RAISE EXCEPTION 'builder_claim_conflict: state %', v_proposal.code_state
      USING ERRCODE = 'P0033';
  END IF;

  IF v_proposal.plan_content IS NOT NULL THEN
    -- scaffold path: every run gets a fresh immutable revision
    SELECT COALESCE(MAX(r.revision_number), 0) + 1 INTO v_next_rev
      FROM public.builder_proposal_revisions r WHERE r.proposal_id = p_proposal_id;
    INSERT INTO public.builder_proposal_revisions
      (proposal_id, revision_number, parent_revision_id, kind, artifact_prefix, created_by)
    VALUES
      (p_proposal_id, v_next_rev, v_proposal.current_revision_id, 'scaffold_generation',
       p_org_id || '/' || p_proposal_id || '/pending', p_actor)
    RETURNING id INTO v_rev_id;
    UPDATE public.builder_proposal_revisions
       SET artifact_prefix = p_org_id || '/' || p_proposal_id || '/' || v_rev_id
     WHERE id = v_rev_id;
    UPDATE public.builder_proposals
       SET code_state = 'queued', current_revision_id = v_rev_id
     WHERE id = p_proposal_id;
    RETURN QUERY SELECT v_rev_id, false;
  ELSE
    -- generic path: reuse the submitted revision
    IF v_proposal.current_revision_id IS NULL THEN
      RAISE EXCEPTION 'builder_claim_no_revision' USING ERRCODE = 'P0034';
    END IF;
    UPDATE public.builder_proposals SET code_state = 'queued' WHERE id = p_proposal_id;
    RETURN QUERY SELECT v_proposal.current_revision_id, true;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.builder_claim_code_run(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.builder_claim_code_run(uuid, uuid, uuid) TO service_role;

-- ============================================================
-- 9. Private artifact bucket (pattern: 0046_compliance_documents_bucket.sql)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('builder-artifacts', 'builder-artifacts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "builder-artifacts: org admins read" ON storage.objects;
CREATE POLICY "builder-artifacts: org admins read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'builder-artifacts'
         AND public.is_org_admin((split_part(name, '/', 1))::uuid));
DROP POLICY IF EXISTS "builder-artifacts: service role" ON storage.objects;
CREATE POLICY "builder-artifacts: service role" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'builder-artifacts') WITH CHECK (bucket_id = 'builder-artifacts');
```

(Adjust the bucket-policy DDL to match `0046_compliance_documents_bucket.sql` exactly — read that file first and mirror its policy naming/guard style.)

- [ ] **Step 5: Delete `db/migrations/0026_builder_enhancement.sql`**

```bash
git rm db/migrations/0026_builder_enhancement.sql
```

Also update `db/migrations/README.md`'s file index: remove the 0026 row and describe 0025 as the canonical Builder schema.

- [ ] **Step 6: Run the schema-contract test**

Run: `npx vitest run app/api/__tests__/builder-schema-contract.test.ts`
Expected: PASS

- [ ] **Step 7: Write the env-gated live RLS test**

Create `app/api/__tests__/builder-rls.live.test.ts` guarded by `describe.skipIf(!process.env.BUILDER_DB_TESTS)`. Against a local Supabase (env `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`): use the service client to seed two orgs + one admin user each + one code proposal with a revision, an attempt, a finding, and a delivery record per org. Assert with user-session clients: org-A admin reads own revision/attempt/finding/delivery rows and gets zero rows for org-B's; an authenticated non-admin gets zero rows; authenticated INSERT into any orchestration table fails; service client can UPDATE a revision without attempts but an UPDATE changing `manifest_hash` after inserting an attempt raises `builder_revision_immutable`; `builder_claim_code_run` on a `plan_ready` scaffold proposal creates revision 1 and sets `code_state='queued'`, and a second immediate call raises `builder_claim_conflict`.

- [ ] **Step 8: Run live RLS test against local Supabase (if available)**

Run: `BUILDER_DB_TESTS=1 npx vitest run app/api/__tests__/builder-rls.live.test.ts`
Expected: PASS locally (skipped in CI without the env var). If no local Supabase is running, note it and verify during Task 11's walkthrough.

- [ ] **Step 9: Commit**

```bash
git add db/migrations/0002_organizations.sql db/migrations/0025_builder.sql db/migrations/README.md app/api/__tests__/builder-schema-contract.test.ts app/api/__tests__/builder-rls.live.test.ts
git commit -m "feat(builder): canonical builder schema with durable orchestration tables"
```

---

### Task 2: Typed domain models + transition service

**Files:**
- Create: `lib/builder/proposal-state.ts`
- Create: `lib/builder/__tests__/proposal-state.test.ts`
- Create: `lib/builder/__tests__/helpers/supabase-mock.ts` (shared mock: `from().update().eq().eq().eq().select().maybeSingle()` chains, `rpc()`, `storage.from().upload()/createSignedUrl()` — reuse across Tasks 5–9 suites)

**Interfaces:**
- Produces (exact exports):

```ts
export const CODE_STATES = ['plan_ready','queued','generating','verifying','needs_repair',
  'ready_to_apply','pr_opened','merged','deployed','rejected','failed'] as const;
export type CodeState = (typeof CODE_STATES)[number];
export const PROPOSAL_STATE_POLICY_VERSION = 'builder-state/v1';
export const REVIEW_POLICY_VERSION = 'builder-review-policy/v1';
export const REQUIRED_CHECK_KEYS: string[] = [];  // Increment 3 populates under v2
export const CLAIMABLE_STATES: CodeState[] = ['plan_ready','needs_repair','failed'];
export const IN_FLIGHT_STATES: CodeState[] = ['queued','generating','verifying'];
export const TERMINAL_STATES: CodeState[] = ['deployed','rejected'];

export interface ProposalRow { id: string; org_id: string; proposal_type: 'config'|'code';
  status: string|null; code_state: CodeState|null; current_revision_id: string|null;
  plan_content: unknown; rejected_reason: string|null; /* ... */ }
export interface RevisionRow { id: string; proposal_id: string; revision_number: number;
  parent_revision_id: string|null; kind: 'scaffold_generation'|'generic_submission'|'repair'|'rebase';
  base_commit_sha: string|null; head_commit_sha: string|null; manifest_hash: string|null;
  diff_hash: string|null; context_hash: string|null; artifact_prefix: string;
  file_count: number|null; total_bytes: number|null; progress: unknown; created_at: string; }
export interface ReviewAttemptRow { id: string; proposal_id: string; revision_id: string;
  attempt_number: number; trigger: 'initial'|'retry'|'repair'|'rebase'|'policy_change';
  status: 'running'|'passed'|'blocked'|'failed'; policy_version: string;
  required_check_keys: string[]; summary_score: number|null;
  started_at: string; completed_at: string|null; decision_reason: string|null; }
export interface FindingRow { id: string; review_attempt_id: string; reviewer_kind: string;
  severity: 'blocker'|'error'|'warning'|'info'; category: string|null; rule_id: string|null;
  file_path: string|null; line_start: number|null; line_end: number|null;
  evidence: string; recommendation: string|null; state: 'open'|'resolved'|'dismissed'; }
export interface VerificationRunRow { id: string; review_attempt_id: string; check_key: string;
  status: 'pending'|'running'|'passed'|'failed'|'error'|'skipped'; exit_code: number|null;
  duration_ms: number|null; log_artifact_key: string|null; evidence_hash: string|null; }
export interface DeliveryRecordRow { id: string; proposal_id: string; revision_id: string;
  provider: 'github'|'vercel'; pr_number: number|null; pr_url: string|null;
  branch_name: string|null; commit_sha: string|null; environment: string|null;
  status: string; created_at: string; }

export function canTransition(from: CodeState, to: CodeState): boolean;
export function assertTransition(from: CodeState, to: CodeState): void; // throws ProposalStateError
export function isTerminalState(state: CodeState): boolean;
export class ProposalStateError extends Error { constructor(public from: CodeState, public to: CodeState); }
export function codeStateLabel(state: CodeState): string;
export function codeStateNextStep(state: CodeState): string;

export type TransitionResult =
  | { ok: true; idempotent?: boolean }
  | { ok: false; currentState: CodeState | null };
export async function transitionProposal(admin: SupabaseClient, args: {
  proposalId: string; orgId: string; from: CodeState; to: CodeState;
  set?: Record<string, unknown>; }): Promise<TransitionResult>;
export async function failInFlightRun(admin: SupabaseClient, proposalId: string): Promise<void>;
export type ClaimResult =
  | { ok: true; revisionId: string; reused: boolean }
  | { ok: false; code: 'not_found' | 'conflict' | 'no_revision'; currentState?: string };
export async function claimCodeRun(admin: SupabaseClient, args: {
  proposalId: string; orgId: string; actorId: string }): Promise<ClaimResult>;
```

- Transition table (encode as `const TRANSITIONS: Record<CodeState, CodeState[]>`):

| from | allowed to |
|---|---|
| `plan_ready` | `queued`, `rejected` |
| `queued` | `generating`, `verifying`, `failed` |
| `generating` | `verifying`, `failed` |
| `verifying` | `needs_repair`, `ready_to_apply`, `failed`, `rejected` |
| `needs_repair` | `queued`, `rejected` |
| `ready_to_apply` | `pr_opened`, `queued`, `rejected` |
| `pr_opened` | `merged`, `needs_repair`, `rejected` |
| `merged` | `deployed` |
| `deployed` | (terminal) |
| `rejected` | (terminal) |
| `failed` | `queued`, `rejected` |

- [ ] **Step 1: Write the failing test** — `lib/builder/__tests__/proposal-state.test.ts`: exhaustive 11×11 matrix asserting `canTransition` against the table above (loop over `CODE_STATES × CODE_STATES`, compare to an expected-pairs set); `assertTransition` throws `ProposalStateError` on a denied pair; `isTerminalState` true only for `deployed`/`rejected`; `codeStateLabel`/`codeStateNextStep` return non-empty strings for all 11 states; `transitionProposal` issues `.update({code_state: to, ...set}).eq('id',…).eq('org_id',…).eq('code_state', from)` and returns `{ok:true}` on a matched row; on 0 rows matched with re-read showing `code_state === to` returns `{ok:true, idempotent:true}`; on 0 rows with a different state returns `{ok:false, currentState}`; `failInFlightRun` CASes `.in('code_state', IN_FLIGHT_STATES)` to `failed` and is a no-op from terminal states; `claimCodeRun` maps RPC success rows to `{ok:true,…}` and Postgres errors `P0032/P0033/P0034` to the typed failure codes.
- [ ] **Step 2: Run it** — `npx vitest run lib/builder/__tests__/proposal-state.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `lib/builder/proposal-state.ts`** per the interface block above. `transitionProposal` uses `.select('code_state').maybeSingle()` after the CAS update; when null, re-read the row to distinguish idempotent success from conflict.
- [ ] **Step 4: Run it** — same command → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): code_state transition service and typed domain models"`

---

### Task 3: Artifact utilities

**Files:**
- Create: `lib/builder/artifacts.ts`
- Create: `lib/builder/__tests__/artifacts.test.ts`

**Interfaces:**
- Consumes: `normalizeProposalPath` from `lib/builder/path-policy.ts`; SHA-256 precedent in `lib/tax/cpa-collaboration.ts:67`.
- Produces:

```ts
export function canonicalJson(value: unknown): string;      // recursive key-sorted, no whitespace
export function sha256Hex(input: string): string;           // node:crypto
export interface FileManifest { entries: { path: string; bytes: number; contentSha256: string }[];
  fileCount: number; totalBytes: number; }
export function buildFileManifest(files: { path: string; content: string }[]): FileManifest;
export function manifestHash(manifest: FileManifest): string;      // sha256Hex(canonicalJson(manifest))
export function buildUnifiedDiff(files: { path: string; content: string }[],
  baseContents?: Map<string, string>): string;              // add-hunks vs /dev/null when no base
export function capAndRedactLog(text: string, maxBytes: number): string;
export function artifactPrefix(orgId: string, proposalId: string, revisionId: string): string;
export const ARTIFACT_KEYS: {
  context: 'context.json'; files: 'files.json'; manifest: 'manifest.json'; diff: 'diff.patch';
  reviewPrompt: (attemptId: string) => string;   // review/{attemptId}/prompt.txt
  reviewResponse: (attemptId: string) => string; // review/{attemptId}/response.json
  checkLog: (checkKey: string) => string;        // checks/{checkKey}.log
};
export async function putJsonArtifact(admin: SupabaseClient, key: string, value: unknown): Promise<void>;
export async function putTextArtifact(admin: SupabaseClient, key: string, body: string, contentType?: string): Promise<void>;
export async function readJsonArtifact<T>(admin: SupabaseClient, key: string): Promise<T | null>;
export async function signArtifactUrl(admin: SupabaseClient, key: string, expiresIn?: number): Promise<string | null>; // default 3600
```

Bucket: `builder-artifacts`; uploads use `upsert: false` (immutability). Redaction patterns in `capAndRedactLog`: `Bearer [A-Za-z0-9._-]+`, `sk-[A-Za-z0-9]+`, `eyJ[A-Za-z0-9._-]+` (JWT), `[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=\S+` → `[redacted]`; truncation appends `\n…[truncated N bytes]`.

- [ ] **Step 1: Write the failing test** — serializer stability (`canonicalJson({b:1,a:{d:2,c:3}}) === canonicalJson(JSON.parse('{"a":{"c":3,"d":2},"b":1}'))`), hash determinism, manifest normalizes and sorts paths (`b.ts` before `a.ts` input → sorted output; `./a.ts` normalized) and byte counts use `Buffer.byteLength`, unified diff emits `--- /dev/null` / `+++ b/<path>` add-hunks with correct `@@ -0,0 +1,N @@` counts (cases: single-line file, empty file, no trailing newline), `capAndRedactLog` redacts each pattern and truncates at the byte cap, `putJsonArtifact`/`signArtifactUrl` call `storage.from('builder-artifacts')` with `upsert:false`/`createSignedUrl(key, 3600)` (mocked client).
- [ ] **Step 2: Run it** → FAIL. — `npx vitest run lib/builder/__tests__/artifacts.test.ts`
- [ ] **Step 3: Implement `lib/builder/artifacts.ts`.**
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): artifact utilities with canonical hashing"`

---

### Task 4: Canonical review gate (rewrite `lib/builder/review-gate.ts`)

**Files:**
- Rewrite: `lib/builder/review-gate.ts`
- Rewrite: `lib/builder/__tests__/review-gate.test.ts`

**Interfaces:**
- Consumes: row types from `lib/builder/proposal-state.ts` (Task 2).
- Produces:

```ts
export const BLOCKING_SEVERITIES = new Set(['blocker','error']);
export interface AttemptGateInput {
  proposal: { code_state: string; current_revision_id: string | null };
  revision: RevisionRow | null;
  attempt: ReviewAttemptRow | null;        // latest attempt for the CURRENT revision
  findings: FindingRow[];                  // that attempt's findings
  verificationRuns: VerificationRunRow[];  // that attempt's runs
  currentPolicyVersion: string;            // pass REVIEW_POLICY_VERSION
}
export interface ReviewGateResult { pass: boolean; blockers: string[]; reason: string | null; }
export function evaluateAttemptGate(input: AttemptGateInput): ReviewGateResult;
// strict LLM-output validator (replaces parseReviewReport):
export interface ParsedModelReview { summaryScore: number | null;
  findings: Array<Pick<FindingRow,'severity'|'category'|'file_path'|'line_start'|'line_end'|'evidence'|'recommendation'>>; }
export function parseModelReviewOutput(value: unknown): ParsedModelReview | null; // null = infra failure
```

Fail (in order, first failure wins the `reason`): no `current_revision_id`; no revision row; revision `manifest_hash` or `diff_hash` null; no attempt; `attempt.revision_id !== current_revision_id`; `attempt.status !== 'passed'` or `completed_at` null; `attempt.policy_version !== currentPolicyVersion`; any finding with `state==='open'` and severity in `BLOCKING_SEVERITIES` (collect into `blockers`); any `attempt.required_check_keys` entry lacking a verification run with `status==='passed'`. `parseModelReviewOutput` normalizes `critical→blocker`; any unknown severity or malformed shape → `null` (infrastructure failure, never an empty pass).

- [ ] **Step 1: Rewrite the test first** — one case per fail clause above, plus: vacuous pass when `required_check_keys=[]` and everything else healthy; pass with a `resolved` blocker finding; **Increment 3 readiness pair**: attempt with `required_check_keys=['verify:types']` and no run → fail; same with a `passed` run → pass; `parseModelReviewOutput` cases: valid report, `critical` normalized, unknown severity → null, non-array findings → null, missing evidence → null.
- [ ] **Step 2: Run it** → FAIL. — `npx vitest run lib/builder/__tests__/review-gate.test.ts`
- [ ] **Step 3: Implement the rewrite.** Delete `parseReviewReport`/`evaluateReviewGate`/`ReviewReport` exports (their consumers are rewritten in Tasks 7–8).
- [ ] **Step 4: Run the suite; expect worker/apply tests to break** — they are rewritten in Tasks 7–8; keep only this file green for now: `npx vitest run lib/builder/__tests__/review-gate.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): attempt-record review gate with required-check hook"`

---

### Task 5: Submission paths in `lib/builder/tools.ts`

**Files:**
- Modify: `lib/builder/tools.ts` (`submit_code_proposal` ~line 1805; `scaffold_module` ~line 1907; `PROPOSAL_PHASES` const ~line 57; `list_proposals` ~line 2006)
- Test: update `lib/builder/__tests__/scaffold-module-tool.test.ts` and the generic-submission cases in `lib/builder/__tests__/module-tools.test.ts` / `scaffold-endpoints.test.ts`

**Interfaces:**
- Consumes: `buildFileManifest`, `manifestHash`, `buildUnifiedDiff`, `canonicalJson`, `sha256Hex`, `artifactPrefix`, `putJsonArtifact`, `putTextArtifact`, `ARTIFACT_KEYS` (Task 3); `CODE_STATES` (Task 2).
- Produces: generic proposals persist as `{proposal_type:'code', code_state:'plan_ready', status:null}` + revision #1 `kind='generic_submission'` with stamped hashes and `current_revision_id` set; scaffold proposals persist `{code_state:'plan_ready', plan_content}` with NO revision (created at claim).

- [ ] **Step 1: Update tests first.** Assert for `submit_code_proposal`: proposal insert payload has `code_state:'plan_ready'` and no `phase`/`generated_code`/`status`; a `builder_proposal_revisions` insert with `kind:'generic_submission'`, `revision_number:1`, non-null `manifest_hash`/`diff_hash`/`context_hash`, `file_count`/`total_bytes` matching the fixture files; storage uploads for `files.json`, `manifest.json`, `diff.patch`, `context.json` under `{orgId}/{proposalId}/{revisionId}/`; proposal updated with `current_revision_id`. On storage failure: proposal row deleted (no orphaned hash-less revision) and the tool returns an error. For `scaffold_module`: insert has `code_state:'plan_ready'`, `plan_content`, no `generated_code` key at all. For `list_proposals`: selects/filters on `code_state`, response contains no `generated_code`.
- [ ] **Step 2: Run** → FAIL. — `npx vitest run lib/builder/__tests__/scaffold-module-tool.test.ts lib/builder/__tests__/module-tools.test.ts`
- [ ] **Step 3: Implement.** Sequence in `submit_code_proposal` (existing `validateProposalFiles` path-policy/budget check stays first): insert proposal → compute manifest/diff/context (context = `canonicalJson({request_text, files: manifest.entries.map(e => e.path)})`) → insert revision with hashes + `artifact_prefix` → upload 4 artifacts → update proposal `current_revision_id`. Wrap artifact steps in try/catch; on failure `await admin.from('builder_proposals').delete().eq('id', proposalId)` and rethrow. Replace `PROPOSAL_PHASES` with `CODE_STATES` import.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): submissions create immutable revisions with artifact hashes"`

---

### Task 6: Build route claim + base SHA capture

**Files:**
- Modify: `lib/builder/github-apply.ts` (extract + export `getDefaultBranchSha(): Promise<string>` from the ref-read at lines 60-66)
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts`
- Modify: `lib/builder/scaffold-worker.ts` (`enqueueScaffoldBuildJob` signature only)
- Test: rewrite `app/api/__tests__/builder-build-claim.test.ts`

**Interfaces:**
- Consumes: `claimCodeRun`, `failInFlightRun` (Task 2).
- Produces: `enqueueScaffoldBuildJob(data: { proposalId: string; orgId: string; revisionId: string }): Promise<string>` with BullMQ `jobId: data.revisionId` (duplicate enqueue returns the existing job — the recorded idempotency key).

- [ ] **Step 1: Rewrite the test.** Cases: 401/403 auth (unchanged); `claimCodeRun` conflict (`P0033`) → 409 with `currentState`; in-flight state → 200 `{alreadyRunning:true}` (route checks `IN_FLIGHT_STATES` before claiming, as today); `not_found` → 404; success → response includes `revisionId`, enqueue called once with `{proposalId, orgId, revisionId}`; GitHub configured → revision updated with `base_commit_sha`; GitHub unconfigured → no SHA update, still 200; enqueue rejection → `failInFlightRun` called and 500.
- [ ] **Step 2: Run** → FAIL. — `npx vitest run app/api/__tests__/builder-build-claim.test.ts`
- [ ] **Step 3: Implement.** Route flow: auth → capability → read `code_state`; if in `IN_FLIGHT_STATES` return `alreadyRunning`; else `claimCodeRun(...)`; on `ok`, if `isGitHubConfigured()` then best-effort `getDefaultBranchSha()` and `update({base_commit_sha}).eq('id', revisionId)` (catch and continue on GitHub errors); `enqueueScaffoldBuildJob({proposalId, orgId, revisionId})`; on enqueue throw → `failInFlightRun` + 500.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): claim RPC in build route with base SHA capture and revision-keyed jobs"`

---

### Task 7: Worker rewrite (`lib/builder/scaffold-worker.ts`)

**Files:**
- Rewrite: `lib/builder/scaffold-worker.ts` (keep queue name `scaffold-jobs`, BullMQ setup, AI provider calls/prompts as-is)
- Test: rewrite `lib/builder/__tests__/scaffold-worker.test.ts`

**Interfaces:**
- Consumes: `transitionProposal`, `failInFlightRun`, `REVIEW_POLICY_VERSION`, `REQUIRED_CHECK_KEYS` (Task 2); artifact utils (Task 3); `evaluateAttemptGate`, `parseModelReviewOutput` (Task 4); `evaluatePathPolicy`, `evaluateFileBudget` (existing).
- Produces: `runBuildPhase(data: { proposalId: string; orgId: string; revisionId: string })`; `markProposalRunFailed(proposalId, orgId, message)` (adds orgId).

`runBuildPhase` sequence:
1. Load proposal + revision. Guard: `code_state === 'queued'` and `current_revision_id === revisionId`; otherwise log and exit cleanly (idempotent re-entry).
2. **Scaffold path** (`plan_content` non-null): `transitionProposal(queued→generating)`; generate files from plan (existing `generateFilesFromPlan` prompts); after each file, `update({progress: {files: [{path, done}]}}).eq('id', revisionId)` (replaces old incremental `generated_code` writes; allowed pre-attempt by the trigger). Then step 3. **Generic path**: `transitionProposal(queued→verifying)`; load files from the revision's `files.json` artifact via `readJsonArtifact`; skip to step 4.
3. (Scaffold only) `evaluatePathPolicy` + `evaluateFileBudget` on generated files; write `files.json`/`manifest.json`/`diff.patch`/`context.json`; stamp `manifest_hash`/`diff_hash`/`context_hash`/`file_count`/`total_bytes` on the revision (freeze); `transitionProposal(generating→verifying)`.
4. Insert `builder_review_attempts` row: `attempt_number = (count of attempts on revision) + 1`, `trigger: attempt_number === 1 ? 'initial' : 'retry'`, `policy_version: REVIEW_POLICY_VERSION`, `required_check_keys: REQUIRED_CHECK_KEYS`.
5. Path-policy violations (either path) → insert one finding per violation (`reviewer_kind:'system'`, `severity:'blocker'`, `evidence: violation.detail`, `file_path: violation.path`), attempt `status:'blocked'` + `completed_at` + `decision_reason`, `transitionProposal(verifying→needs_repair)`, return.
6. Run the single-model review (existing prompt). Persist `review/{attemptId}/prompt.txt` and `response.json` artifacts (response through `capAndRedactLog(text, 200_000)`). `parseModelReviewOutput`: on `null` → attempt `status:'failed'` + `decision_reason:'Model review output invalid'`, `transitionProposal(verifying→failed)`, return (infra failure, NOT a synthetic finding). On success → insert findings (`reviewer_kind:'automated_review'`, `state:'open'`), set `summary_score`.
7. Re-load findings/runs; `evaluateAttemptGate(...)`: pass → attempt `status:'passed'` + `completed_at` + `decision_reason:'All gates passed'`, `transitionProposal(verifying→ready_to_apply)`; fail → `status:'blocked'` + `decision_reason: gate.reason`, `transitionProposal(verifying→needs_repair)`.

`markProposalRunFailed`: find the latest `running` attempt for the proposal; if present, set `status:'failed'`, `completed_at`, `decision_reason` and insert one `system`/`error` finding with `evidence: capAndRedactLog(message, 10_000)`; then `failInFlightRun`. No `review_report` writes anywhere.

- [ ] **Step 1: Rewrite the test.** Cases: scaffold happy path asserts the exact state sequence `queued→generating→verifying→ready_to_apply`, artifact uploads + hash stamping happen BEFORE the attempt insert, attempt row shape (`policy_version`, `required_check_keys: []`, `trigger:'initial'`); generic path skips `generating` and reads `files.json`; path violation → blocker findings rows + `needs_repair` + attempt `blocked`; malformed model JSON → attempt `failed` + state `failed` + zero findings inserted; model findings with an `error` severity → `needs_repair` with blockers listed; re-entry with `code_state !== 'queued'` exits without writes; `markProposalRunFailed` completes the running attempt and CASes in-flight → `failed`; second run on same revision gets `attempt_number: 2, trigger:'retry'`.
- [ ] **Step 2: Run** → FAIL. — `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
- [ ] **Step 3: Implement the rewrite.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): worker records immutable attempts, findings, and artifacts"`

---

### Task 8: Apply route + delivery record

**Files:**
- Modify: `lib/builder/github-apply.ts` (`applyProposalToGitHub` return shape; drop `reviewScore` param)
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts`
- Modify: `app/api/admin/builder/proposals/route.ts` (drop `generated_code` from select; return `code_state` + revision `file_count`)
- Modify: `app/api/admin/builder/proposals/[proposalId]/route.ts` (code proposals: only `rejected` allowed, via state service + `rejected_reason`)
- Test: rewrite `app/api/__tests__/builder-apply-gate.test.ts`; update `lib/builder/__tests__/github-apply.test.ts` (if present) for the new return shape

**Interfaces:**
- Produces: `applyProposalToGitHub(proposalId, moduleName, files): Promise<{ prUrl: string; prNumber: number; branchName: string; baseSha: string; headSha: string }>` — capture `number` and `head.sha` from the PR create/lookup responses; PR body states attempt facts (e.g. `Review attempt 2 passed under builder-review-policy/v1`), never a score.

Apply route gate order (each failure returns before the next check):
1. auth → `canReviewImplementation` (403) → `isGitHubConfigured` (503) — unchanged;
2. proposal `proposal_type==='code'`, `code_state==='ready_to_apply'`, `current_revision_id` non-null → else 409;
3. load revision + latest attempt (by `started_at` desc for `revision_id`) + its findings + verification runs → `evaluateAttemptGate` → 409 `{error, blockers}`;
4. load `files.json` artifact; recompute `manifestHash(buildFileManifest(files))` and `sha256Hex(buildUnifiedDiff(files))`; mismatch vs revision columns → 409 `'Revision artifacts do not match recorded hashes'` (tamper guard);
5. `evaluatePathPolicy` re-check → 422 (unchanged);
6. staleness: if `revision.base_commit_sha` non-null, `getDefaultBranchSha()`; drift → 409 `'Base branch has moved since review; re-run the review'` (state stays `ready_to_apply`; reviewer re-queues). If null: capture now, stamp via update, proceed (decision 5);
7. `applyProposalToGitHub(...)`; insert `builder_delivery_records` `{proposal_id, revision_id, provider:'github', status:'pr_open', pr_number, pr_url, branch_name, commit_sha: headSha, provider_event_id: 'pr:'+prNumber, payload_hash: sha256Hex(canonicalJson({prNumber, headSha}))}`; stamp `revision.head_commit_sha = headSha`; `transitionProposal(ready_to_apply→pr_opened, set: {reviewed_by, reviewed_at})` — NO `status:'approved'`, NO `pr_url` column write;
8. `builder_events` `proposal_applied` insert unchanged (payload now includes `prNumber`).

- [ ] **Step 1: Rewrite the test.** One case per gate clause: wrong `code_state` → 409; missing attempt → 409; attempt pointing at a stale (non-current) revision → 409; stale `policy_version` → 409; open blocker finding → 409 with blocker text; `required_check_keys:['verify:types']` without a passed run → 409 (**Increment 3 readiness**); manifest-hash mismatch → 409; diff-hash mismatch → 409; base drift → 409 and state unchanged; null `base_commit_sha` → SHA captured, stamped, proceeds; happy path → delivery-record insert asserted, `head_commit_sha` stamped, transition to `pr_opened` with `reviewed_by`, and **no** update containing `status` or `pr_url` keys; GitHub never called in any failure case.
- [ ] **Step 2: Run** → FAIL. — `npx vitest run app/api/__tests__/builder-apply-gate.test.ts`
- [ ] **Step 3: Implement** route + `github-apply.ts` changes + admin route changes.
- [ ] **Step 4: Run** → PASS (including `builder-ship-retired.test.ts`, untouched).
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): apply route gates on canonical records and writes delivery facts"`

---

### Task 9: List/detail API contract

**Files:**
- Modify: `app/api/org/[orgId]/builder/proposals/route.ts` (list)
- Modify: `app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts` (detail)
- Test: `app/api/__tests__/builder-proposals-contract.test.ts` (new)

**Interfaces (response shapes — the contract Tasks 10 consumes):**

List (`GET .../builder/proposals`) — summary only, no source code, no finding bodies:

```ts
{ proposals: Array<{
  id: string; request_text: string; requested_by_name: string | null;
  proposal_type: 'config'|'code'; created_at: string;
  config: { status: string; config_patch: unknown; reviewer_notes: string|null } | null;
  code: {
    code_state: CodeState; rejected_reason: string | null;
    revision: { id: string; revision_number: number; kind: string;
                base_commit_sha: string|null; file_count: number|null;
                total_bytes: number|null; created_at: string } | null;
    latest_attempt: { status: string; policy_version: string; blocker_count: number;
                      warning_count: number; summary_score: number|null;
                      completed_at: string|null } | null;
    checks: { required: number; passed: number; failed: number; pending: number };
    delivery: { status: string; pr_url: string|null; pr_number: number|null } | null;
  } | null;
}> }
```

Implementation: 4 batched service-role queries — proposals for org; revisions `in('id', currentRevisionIds)`; latest attempts per revision + finding severity counts (`in('review_attempt_id', attemptIds)` then group in JS); latest delivery per proposal. Keep org-admin auth as today.

Detail (`GET .../builder/proposals/[proposalId]`):

```ts
{ proposal: { id, request_text, proposal_type, code_state, status,
              plan_summary: { moduleName: string|null, plannedPaths: string[] } | null,
              rejected_reason, reviewer_notes, created_at },
  revision: { id, revision_number, kind, parent_revision_id, base_commit_sha, head_commit_sha,
              manifest: { entries: {path, bytes}[], fileCount, totalBytes } | null,
              manifest_hash, diff_hash, context_hash, progress, created_at } | null,
  attempts: Array<{ id, attempt_number, trigger, status, policy_version, required_check_keys,
                    summary_score, started_at, completed_at, decision_reason,
                    findings: FindingRow[],
                    verification_runs: { check_key, status, exit_code, duration_ms, log_url: string|null }[] }>,
  delivery: DeliveryRecordRow[],
  artifacts: { diff_url: string|null, files_url: string|null, context_url: string|null } }
```

`attempts` newest-first, across ALL revisions of the proposal (history). Manifest read from the `manifest.json` artifact (`readJsonArtifact`) or `null` while generation is in progress. Signed URLs via `signArtifactUrl` (3600s).

- [ ] **Step 1: Write the failing contract test.** Recursive payload assertion that the list response contains no key named `content`, `generated_code`, `review_report`, or `evidence` anywhere; aggregate counts computed correctly from fixtures (2 open blockers + 1 warning → `blocker_count:2, warning_count:1`); `checks` counts derive from `required_check_keys` vs runs; detail returns attempts with nested findings/runs and calls `createSignedUrl` once per present artifact; 401 unauthenticated; 403 non-admin; 404 for a proposal in another org.
- [ ] **Step 2: Run** → FAIL. — `npx vitest run app/api/__tests__/builder-proposals-contract.test.ts`
- [ ] **Step 3: Implement both routes.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(builder): summary/detail API contract with signed artifact links"`

---

### Task 10: UI migration + mapper removal

**Files:**
- Delete: `lib/builder/proposal-lifecycle.ts`, `lib/builder/__tests__/proposal-lifecycle.test.ts`
- Modify: `components/builder-studio/StudioProposalsPanel.tsx`
- Modify: `components/settings/builder/BuildProgressCard.tsx`
- Modify: `components/settings/builder/ReviewReportCard.tsx`
- Modify: `components/settings/BuilderChat.tsx` (~lines 300-330, wherever it feeds ReviewReportCard)
- Modify: `components/builder-studio/StudioWorkflowPanel.tsx` (lifecycle references)
- Modify: `components/admin/BuilderProposalsClient.tsx` (replace `generated_code.files` rendering with `file_count`/state)

**Interfaces:**
- Consumes: Task 9 response shapes; `codeStateLabel`/`codeStateNextStep` from `lib/builder/proposal-state.ts` (client-safe pure module — no server imports).

Changes:
- `StudioProposalsPanel`: `Proposal` interface becomes the list-item shape from Task 9. Badge + actions keyed on `code.code_state` (config proposals on `config.status`). Evidence line per code proposal: `Revision {n} · base {sha8 ?? 'uncaptured'} · {file_count} files · {blocker_count} blockers · checks {passed}/{required}`. "Start build"/"Retry" buttons for `plan_ready|needs_repair|failed`; "Open PR" for `ready_to_apply`; PR link from `code.delivery.pr_url`. Findings list moves behind the detail fetch.
- `BuildProgressCard`: poll the detail route (2s, unchanged); per-file ticks from `revision.progress.files[].done` matched against `plan_summary.plannedPaths`; terminal on `code_state ∈ {ready_to_apply, needs_repair, failed}`; on terminal, surface the latest attempt's `decision_reason` and findings.
- `ReviewReportCard`: props become `{ attempt: {status, policy_version, summary_score, decision_reason} | null; findings: FindingRow[]; codeState: CodeState; prUrl: string | null; proposalId; orgId; githubEnabled; canReviewImplementation }`. Blockers first with severity text (not color alone); score rendered as `Summary score {n} (non-authoritative)` only when present. "Open PR" shown when `codeState === 'ready_to_apply' && !prUrl && canReviewImplementation`; caption under the diff/file section: `Diff shown against an empty base until sandbox verification ships (Increment 3)`.

- [ ] **Step 1: Update `scaffold-endpoints.test.ts` and any test importing `proposal-lifecycle`** to use `codeStateLabel`/`codeStateNextStep` and the new shapes; delete `proposal-lifecycle.test.ts`.
- [ ] **Step 2: Implement all component changes; delete the mapper.**
- [ ] **Step 3: Typecheck + full suite** — `npx tsc --noEmit && npx vitest run` → PASS (component coverage in this repo is API-contract-driven; the manual walkthrough in Task 11 covers rendering).
- [ ] **Step 4: Commit** — `git commit -m "feat(builder): Studio consumes canonical evidence records; retire lifecycle mapper"`

---

### Task 11: Cleanup, docs, verification

**Files:**
- Modify: `docs/BUILDER_OPERATIONS.md` (states table, new tables/bucket, artifact keys, worker restart note, dev-DB reset requirement)
- Modify: `CLAUDE.md` (if it gains a Builder section, add the canon: `code_state` model, five tables, `builder-artifacts` bucket, "review_report/generated_code/phase/pr_url do not exist — do not recreate")
- Test: add the grep guard to `app/api/__tests__/builder-schema-contract.test.ts`

- [ ] **Step 1: Add the source-guard test** (in the schema-contract file):

```ts
it('no runtime source references transitional builder fields', () => {
  // recursively scan app/ lib/ components/ (skip __tests__, .test., node_modules)
  // assert no file contains: builder_proposals'-adjacent usage of
  // 'generated_code', 'review_report', "'phase'", '.phase', 'pr_url', 'proposal-lifecycle'
  // Implementation: walk files, filter to those also containing 'builder', regex the tokens.
});
```

- [ ] **Step 2: Run guard, fix stragglers** — `npx vitest run app/api/__tests__/builder-schema-contract.test.ts`; also run `grep -rn "proposal-lifecycle\|review_report\|generated_code" app/ lib/ components/ --include='*.ts' --include='*.tsx' | grep -v __tests__` and clean every hit.
- [ ] **Step 3: Full verification** — `npx tsc --noEmit && npx vitest run` → all PASS.
- [ ] **Step 4: Live walkthrough** (repo convention; requires local Supabase + Redis): reset DB from canonical `db/migrations` (`scripts/run-migrations.sh` against local), then: create a generic proposal via the Builder chat tool → confirm `plan_ready` + revision row + 4 artifacts in the bucket → claim via Studio → worker run (AI mocked or live) → confirm attempt + findings rows → apply with a blocker present → 409 → resolve → apply → PR opened + delivery record + `pr_opened`. Run `BUILDER_DB_TESTS=1 npx vitest run app/api/__tests__/builder-rls.live.test.ts`.
- [ ] **Step 5: Update docs, commit, and prepare the single PR**

```bash
git add -A
git commit -m "docs(builder): document durable data contract; add transitional-field guard"
```

PR body must call out: dev/preview DBs require a fresh reset (0025 rewritten, 0026 deleted, no migrations ledger); long-lived worker processes must restart with this release (job payload gained `revisionId`); diff artifacts are synthesized against an empty base until Increment 3's sandbox produces the authoritative diff.

---

## Sequencing risks

1. **Fresh-reset requirement** — rewritten 0025 + deleted 0026 no-op on existing dev DBs (`IF NOT EXISTS`); every dev/preview instance must reset. In-flight proposals are lost (fine prerelease). Say so in the PR.
2. **Big-bang cutover** — after Task 4, worker/apply tests are red until Tasks 7–8 land. Tasks commit individually but the branch merges as one PR; never merge Tasks 1–4 alone.
3. **Circular FK** (`builder_proposals.current_revision_id` ↔ `revisions.proposal_id`) — added via `ALTER TABLE ... ADD CONSTRAINT` after both tables exist; `ON DELETE SET NULL` keeps the proposal cascade working.
4. **Worker/API payload skew** — job payload gains `revisionId`; a long-lived BullMQ worker must restart with the release (ops doc note).
5. **Test mocks** — hand-rolled supabase mocks now need `rpc()` and `storage.from()`; the shared helper in Task 2 prevents per-suite re-implementation.
6. **Diff authenticity** — until Increment 3's sandbox, `diff.patch` is synthesized (adds-only, no base contents). The hash-match gate still detects tampering between worker and apply; the UI caption in Task 10 discloses the limitation.

## Verification (end-to-end)

- `npx tsc --noEmit` — clean.
- `npx vitest run` — full suite green, including the new schema-contract, proposal-state matrix, artifacts, review-gate, worker, apply-gate, and API-contract suites.
- `BUILDER_DB_TESTS=1 npx vitest run app/api/__tests__/builder-rls.live.test.ts` against a local Supabase reset — org isolation, service-role writes, immutability trigger, claim RPC all verified live.
- Manual walkthrough per Task 11 Step 4 (generic proposal → claim → worker → gated apply → PR + delivery record).
- Exit criteria from the audit: a revision cannot be altered after an attempt starts (trigger + live test); retry creates a new revision (claim RPC, scaffold path) or a new attempt (generic path); the detail API explains every state from persisted evidence alone (contract test asserts attempts/findings/runs/delivery present).
