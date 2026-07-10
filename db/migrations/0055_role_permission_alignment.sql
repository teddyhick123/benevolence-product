-- =============================================================================
-- 0055_role_permission_alignment.sql
-- Align operational grants and tasks with the canonical member+ write model.
-- Imports remain admin+ because they create organization-wide data changes.
-- =============================================================================

-- Tasks and their links are operational records. Members can create and manage
-- them; route handlers retain finer-grained assignee/creator safeguards.
DROP POLICY IF EXISTS "tasks: org admins can manage" ON public.tasks;
DROP POLICY IF EXISTS "tasks: org members can manage" ON public.tasks;
CREATE POLICY "tasks: org members can manage"
  ON public.tasks FOR ALL TO authenticated
  USING (public.can_edit_org(org_id) AND deleted_at IS NULL)
  WITH CHECK (public.can_edit_org(org_id));

DROP POLICY IF EXISTS "task_entity_links: org admins can manage" ON public.task_entity_links;
DROP POLICY IF EXISTS "task_entity_links: org members can manage" ON public.task_entity_links;
CREATE POLICY "task_entity_links: org members can manage"
  ON public.task_entity_links FOR ALL TO authenticated
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));

DROP POLICY IF EXISTS "task_comments: org members can comment" ON public.task_comments;
CREATE POLICY "task_comments: org members can comment"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id) AND author_id = auth.uid());

-- Grants are operational records. Child records inherit their org from grants.
DROP POLICY IF EXISTS "grants: org admins can manage" ON public.grants;
DROP POLICY IF EXISTS "grants: org members can manage" ON public.grants;
CREATE POLICY "grants: org members can manage"
  ON public.grants FOR ALL TO authenticated
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));

DO $$
DECLARE
  table_name text;
  old_policy text;
  new_policy text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'grant_milestones',
    'grant_reports',
    'grant_payments',
    'grant_budget_items',
    'grant_communications',
    'grant_documents',
    'grant_contacts'
  ]
  LOOP
    old_policy := format('%s: org admins can manage', table_name);
    new_policy := format('%s: org members can manage', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', new_policy, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id))) WITH CHECK (public.can_edit_org((SELECT g.org_id FROM public.grants g WHERE g.id = grant_id)))',
      new_policy,
      table_name
    );
  END LOOP;
END
$$;

DROP POLICY IF EXISTS "grant_status_history: org admins can manage" ON public.grant_status_history;
DROP POLICY IF EXISTS "grant_status_history: org members can manage" ON public.grant_status_history;
CREATE POLICY "grant_status_history: org members can manage"
  ON public.grant_status_history FOR ALL TO authenticated
  USING (public.can_edit_org(org_id))
  WITH CHECK (public.can_edit_org(org_id));

DROP POLICY IF EXISTS "grant_decisions: org admins can insert" ON public.grant_decisions;
DROP POLICY IF EXISTS "grant_decisions: org members can insert" ON public.grant_decisions;
CREATE POLICY "grant_decisions: org members can insert"
  ON public.grant_decisions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id));

DROP POLICY IF EXISTS "grant_checklist_completions_insert" ON public.grant_checklist_completions;
CREATE POLICY "grant_checklist_completions_insert" ON public.grant_checklist_completions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_org(org_id) AND completed_by = auth.uid());
