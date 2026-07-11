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

-- ---------------------------------------------------------------------------
-- builder_sessions — persists Builder chat history per org+user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS builder_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  messages    jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS builder_sessions_org_updated_idx
  ON builder_sessions (org_id, updated_at DESC);

ALTER TABLE builder_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "builder_sessions: users can manage own session"
  ON builder_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "builder_sessions: service role"
  ON builder_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON builder_sessions TO authenticated;
GRANT ALL ON builder_sessions TO service_role;

CREATE TRIGGER set_builder_sessions_updated_at
  BEFORE UPDATE ON builder_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
  status            text NOT NULL CHECK (status IN ('pr_open','pr_closed','pr_merged','deploy_pending','deploy_succeeded','deploy_failed')),
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

-- Drop existing policies before recreating (idempotent re-run safety)
DROP POLICY IF EXISTS "builder_artifacts_read"    ON storage.objects;
DROP POLICY IF EXISTS "builder_artifacts_service" ON storage.objects;

-- Read: org admin can access their org's files (path format: orgId/proposalId/...)
CREATE POLICY "builder_artifacts_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'builder-artifacts'
    AND public.is_org_admin(
      (split_part(name, '/', 1))::uuid
    )
  );

-- Service role: full access (used by createAdminClient)
CREATE POLICY "builder_artifacts_service"
  ON storage.objects FOR ALL TO service_role
  USING  (bucket_id = 'builder-artifacts')
  WITH CHECK (bucket_id = 'builder-artifacts');
