-- =============================================================================
-- 0056_onboarding_provisioning_recovery.sql
-- Makes onboarding-created automations idempotent across setup retries.
-- =============================================================================

ALTER TABLE public.org_automation_rules
  ADD COLUMN IF NOT EXISTS onboarding_session_id uuid
  REFERENCES public.onboarding_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.org_automation_rules
  DROP CONSTRAINT IF EXISTS org_automation_rules_onboarding_session_rule_key;

ALTER TABLE public.org_automation_rules
  ADD CONSTRAINT org_automation_rules_onboarding_session_rule_key
  UNIQUE (org_id, onboarding_session_id, name);

CREATE INDEX IF NOT EXISTS idx_org_automation_rules_onboarding_session
  ON public.org_automation_rules (onboarding_session_id)
  WHERE onboarding_session_id IS NOT NULL;
