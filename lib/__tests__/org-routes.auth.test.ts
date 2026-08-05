// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('org-scoped route auth contracts', () => {
  it('organization collection routes use the user principal and scoped provisioner', () => {
    const src = readFileSync('app/api/org/route.ts', 'utf8');

    expect(src).toContain('requireUserAccess');
    expect(src).toContain('createOrganizationProvisioningRepository');
    expect(src).toContain('createOrganizationSchema');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
    expect(src).not.toContain('createServerClient');
  });

  it('organization dashboard requires org membership before admin reads and disables caching', () => {
    const src = readFileSync('app/api/org/[orgId]/dashboard/route.ts', 'utf8');

    expect(src).toContain('requireOrgAccess');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
    expect(src).not.toContain('createServerClient');
  });

  it('organization metrics require view/edit access, scope writes to org holdings, and disable caching', () => {
    const src = readFileSync('app/api/org/[orgId]/metrics/route.ts', 'utf8');

    expect(src).toContain('requireOrgAccess');
    expect(src).toContain("requireOrgAccess(orgId, \"member\")");
    expect(src).toContain('.eq("org_id", orgId)');
    expect(src).toContain('submitted_by_org_id: orgId');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
    expect(src).not.toContain('createServerClient');
  });

  it('notification routes are user scoped and disable caching', () => {
    for (const route of [
      'app/api/org/[orgId]/notifications/route.ts',
      'app/api/org/[orgId]/notifications/[notificationId]/read/route.ts',
      'app/api/org/[orgId]/notifications/mark-all-read/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');

      expect(src, route).toContain('requireOrgAccess');
      expect(src, route).toContain("recipient_user_id', user.id");
      expect(src, route).toContain('jsonOk');
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).not.toContain('createServerClient');
    }
  });

  it('member notification preferences can only be changed by the authenticated member', () => {
    const src = readFileSync('app/api/org/[orgId]/members/[userId]/notifications/route.ts', 'utf8');

    expect(src).toContain('requireOrgAccess');
    expect(src).toContain('principal.userId !== userId');
    expect(src).toContain('createNotificationPreferenceRepository');
    expect(src).toContain('jsonOk');
    expect(src).not.toContain('createAdminClient');
    expect(src).not.toContain('createServerClient');
  });

  it('notification listing validates paging and status inputs', () => {
    const src = readFileSync('app/api/org/[orgId]/notifications/route.ts', 'utf8');

    expect(src).toContain("['unread', 'read', 'all'].includes(status)");
    expect(src).toContain('Number.isFinite(requestedLimit)');
  });

  it('task routes disable caching and sanitize list limits', () => {
    for (const route of [
      'app/api/org/[orgId]/tasks/route.ts',
      'app/api/org/[orgId]/tasks/summary/route.ts',
      'app/api/org/[orgId]/tasks/[taskId]/route.ts',
      'app/api/org/[orgId]/tasks/[taskId]/comments/route.ts',
      'app/api/org/[orgId]/tasks/[taskId]/complete/route.ts',
      'app/api/org/[orgId]/tasks/[taskId]/reopen/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');

      expect(src, route).toContain('requireOrgAccess');
      expect(src, route).toMatch(/jsonOk|jsonError/);
      expect(src, route).not.toContain('createAdminClient');
      expect(src, route).not.toContain('createServerClient');
    }

    const tasksRoute = readFileSync('app/api/org/[orgId]/tasks/route.ts', 'utf8');
    expect(tasksRoute).toContain('Number.isFinite(requestedLimit)');
  });

  it('manual task creation validates entity links and rolls back partial writes', () => {
    const src = readFileSync('lib/api/repositories/tasks.ts', 'utf8');

    expect(src).toContain('TASK_ENTITY_TYPES');
    expect(src).toContain('assertEntityLink');
    expect(src).toContain('DIRECT_ORG_ENTITY_TABLES');
    expect(src).toContain('GRANT_CHILD_ENTITY_TABLES');
    expect(src).toContain("await db.from('tasks').delete()");
    expect(src).toContain('linkError');
    expect(src).toContain('eventError');
  });

  it('task status/comment mutations check audit writes and scope grant milestone sync', () => {
    const repository = readFileSync('lib/api/repositories/tasks.ts', 'utf8');
    expect(repository).toContain('eventError');
    expect(repository).toContain("from('task_comments').delete()");
    expect(repository).toContain('before_values: existing');
    expect(repository).toContain('syncGrantMilestoneCompletion');
    expect(repository).toContain(".eq('org_id', scope.orgId)");
    expect(repository).toContain(".eq('grants.org_id', scope.orgId)");
    expect(repository).toContain('status: existing.status');
  });

  it('donor routes protect PII, disable caching, and preserve contribution history on delete', () => {
    for (const route of [
      'app/api/org/[orgId]/donors/route.ts',
      'app/api/org/[orgId]/donors/[donorId]/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('requireOrgAccess');
      expect(src, route).toContain('jsonError');
      expect(src, route).not.toContain('createServerClient');
    }

    const listRoute = readFileSync('app/api/org/[orgId]/donors/route.ts', 'utf8');
    expect(listRoute).toContain("requireOrgAccess(orgId, 'member')");
    expect(listRoute).toContain('createDonorSchema');

    const detailRoute = readFileSync('app/api/org/[orgId]/donors/[donorId]/route.ts', 'utf8');
    expect(detailRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(detailRoute).toContain('updateDonorSchema');
    expect(detailRoute).toContain('deleted_at');
    expect(detailRoute).toContain('deleted_by');
    expect(detailRoute).not.toContain(".delete()");
  });

  it('contribution routes verify donor ownership and sanitize money-list inputs', () => {
    const src = readFileSync('app/api/org/[orgId]/contributions/route.ts', 'utf8');

    expect(src).toContain('"Cache-Control": "no-store"');
    expect(src).toContain('Number.isFinite(requestedLimit)');
    expect(src).toContain('Number.isFinite(numericAmount)');
    expect(src).toContain('GIFT_TYPES');
    expect(src).toContain('.eq("id", donor_id)');
    expect(src).toContain('.eq("org_id", orgId)');
    expect(src).toContain('Donor does not belong to this organization');
  });

  it('single contribution routes use allowlisted updates and atomic receipt generation', () => {
    const detailRoute = readFileSync('app/api/org/[orgId]/contributions/[id]/route.ts', 'utf8');
    expect(detailRoute).toContain('"Cache-Control": "no-store"');
    expect(detailRoute).toContain('UPDATE_FIELDS');
    expect(detailRoute).toContain('GIFT_TYPES');
    expect(detailRoute).toContain('Number.isFinite(numericAmount)');
    expect(detailRoute).toContain('Donor does not belong to this organization');
    expect(detailRoute).not.toContain('...rest');

    const receiptRoute = readFileSync('app/api/org/[orgId]/contributions/[id]/receipt/route.ts', 'utf8');
    expect(receiptRoute).toContain('jsonOk');
    expect(receiptRoute).toContain('requireOrgAccess');
    expect(receiptRoute).toContain('createContributionReceiptRepository');
    expect(receiptRoute).not.toContain('createAdminClient');
    expect(receiptRoute).not.toContain('createServerClient');
    const receiptPost = receiptRoute.slice(0, receiptRoute.indexOf('// GET /api/org/[orgId]/contributions/[id]/receipt'));
    expect(receiptPost).not.toContain('contributionUpdateError');
    expect(receiptPost).not.toContain('from("acknowledgment_letters")');
    expect(receiptPost).not.toContain('.delete()');
  });

  it('acknowledgment routes use canonical columns and no-store responses', () => {
    for (const route of [
      'app/api/org/[orgId]/acknowledgments/route.ts',
      'app/api/org/[orgId]/acknowledgments/[id]/route.ts',
      'app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toMatch(/'Cache-Control': 'no-store'|jsonOk/);
    }

    const listRoute = readFileSync('app/api/org/[orgId]/acknowledgments/route.ts', 'utf8');
    expect(listRoute).toContain('tax_deductible_amount');
    expect(listRoute).toContain('Contribution not found for this donor');
    expect(listRoute).toContain('contributionUpdateError');
    expect(listRoute).not.toContain('is_tax_deductible');

    const detailRoute = readFileSync('app/api/org/[orgId]/acknowledgments/[id]/route.ts', 'utf8');
    expect(detailRoute).toContain('contribution_ids');
    expect(detailRoute).toContain('acknowledgment_sent');
    expect(detailRoute).toContain('acknowledged_at');
    expect(detailRoute).not.toContain("select('contribution_id')");
    expect(detailRoute).not.toContain('contributions_received:contribution_id');
    expect(detailRoute).not.toContain('acknowledgment_status');

    const pdfRoute = readFileSync('app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts', 'utf8');
    const pdfRepository = readFileSync('lib/api/repositories/acknowledgment-pdfs.ts', 'utf8');
    expect(pdfRoute).toContain("requireOrgAccess(orgId, 'member')");
    expect(pdfRoute).toContain('createAcknowledgmentPdfRepository');
    expect(pdfRoute).not.toContain('createAdminClient');
    expect(pdfRoute).not.toContain('createServerClient');
    expect(pdfRoute).toContain('updateError');
    expect(pdfRepository).toContain('.remove([pathFor(letterId)])');
    expect(pdfRepository).toContain('createSignedUrl');
  });

  it('org admin routes use no-store, soft delete, and durable audit for membership changes', () => {
    const auditRoute = readFileSync('app/api/org/[orgId]/audit/route.ts', 'utf8');
    expect(auditRoute).toContain('jsonOk');
    expect(auditRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(auditRoute).not.toContain('createAdminClient');
    expect(auditRoute).not.toContain('createServerClient');
    expect(auditRoute).toContain('Number.isFinite(requestedLimit)');

    const orgRoute = readFileSync('app/api/org/[orgId]/route.ts', 'utf8');
    expect(orgRoute).toContain("'Cache-Control': 'no-store'");
    expect(orgRoute).toContain('deleted_at');
    expect(orgRoute).toContain('deleted_by');
    expect(orgRoute).toContain('is_active: false');
    expect(orgRoute).not.toContain("from('organizations').delete()");

    const memberRoute = readFileSync('app/api/org/[orgId]/members/[userId]/route.ts', 'utf8');
    const membershipRepository = readFileSync('lib/api/repositories/memberships.ts', 'utf8');
    expect(memberRoute).toContain('requireOrgAccess');
    expect(memberRoute).toContain('jsonOk');
    expect(memberRoute).not.toContain('createAdminClient');
    expect(membershipRepository).toContain('countActiveOwners');
    expect(membershipRepository).toContain('Cannot change the last owner role');
    expect(membershipRepository).toContain('Cannot remove the last owner');
    expect(membershipRepository).toContain('auditError');
    expect(membershipRepository).toContain('deleted_at: removedAt');
    expect(membershipRepository).toContain('deleted_at: null');
    expect(memberRoute).not.toContain(".delete()");
  });

  it('compliance and grant calendars avoid stale obligation views', () => {
    const complianceRoute = readFileSync('app/api/org/[orgId]/compliance/filing-calendar/route.ts', 'utf8');
    expect(complianceRoute).toContain('jsonOk');
    expect(complianceRoute).toContain('jsonError');
    expect(complianceRoute).toContain('Number.isFinite(requestedDays)');
    expect(complianceRoute).toContain('taskSyncError');
    expect(complianceRoute).toContain('requireOrgAccess');
    expect(complianceRoute).toContain('syncFilingStatusTasks');
    expect(complianceRoute).not.toContain('createAdminClient');
    expect(complianceRoute).not.toContain('Fire-and-forget');

    const grantCalendarRoute = readFileSync('app/api/org/[orgId]/grants/calendar/route.ts', 'utf8');
    expect(grantCalendarRoute).toContain('requireOrgAccess');
    expect(grantCalendarRoute).toContain('jsonOk');
    expect(grantCalendarRoute).not.toContain('createAdminClient');
    expect(grantCalendarRoute).toContain('Number.isFinite(requestedDaysAhead)');
    expect(grantCalendarRoute).toContain('Math.min(requestedDaysAhead, 365)');
  });

  it('grant routes use no-store, safe inputs, and checked lifecycle side effects', () => {
    const grantsRoute = readFileSync('app/api/org/[orgId]/grants/route.ts', 'utf8');
    expect(grantsRoute).toContain('jsonOk');
    expect(grantsRoute).toContain('jsonError');
    expect(grantsRoute).toContain('Number.isFinite(requestedPage)');
    expect(grantsRoute).toContain('Number.isFinite(numericRequestedAmount)');
    expect(grantsRoute).toContain('LIFECYCLE_STAGES');
    expect(grantsRoute).toContain('internal_owner_id is not a member of this organization');
    expect(grantsRoute).toContain('createWithFoundationRecords');
    expect(grantsRoute).toContain('Failed to create grant atomically');
    expect(grantsRoute).not.toContain('historyError');
    expect(grantsRoute).not.toContain('workflowError');

    const grantDetailRoute = readFileSync('app/api/org/[orgId]/grants/[grantId]/route.ts', 'utf8');
    expect(grantDetailRoute).toContain('jsonOk');
    expect(grantDetailRoute).toContain('jsonError');
    expect(grantDetailRoute).toContain('Use the /transition endpoint');
    expect(grantDetailRoute).toContain('.eq(\'org_id\', orgId)');
    expect(grantDetailRoute).toContain('internal_owner_id is not a member of this organization');
  });

  it('grant transition and decision routes no-store lifecycle and board decision data', () => {
    for (const route of [
      'app/api/org/[orgId]/grants/[grantId]/transition/route.ts',
      'app/api/org/[orgId]/grants/bulk-transition/route.ts',
      'app/api/org/[orgId]/grants/[grantId]/decisions/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toMatch(/'Cache-Control': 'no-store'|jsonOk/);
    }

    const decisionsRoute = readFileSync('app/api/org/[orgId]/grants/[grantId]/decisions/route.ts', 'utf8');
    expect(decisionsRoute).toContain('decisionSchema');
    expect(decisionsRoute).toContain('requireUserInOrg');
    expect(decisionsRoute).toContain('createGrantRepository');
    expect(decisionsRoute).not.toContain('createAdminClient');
    expect(decisionsRoute).toContain('decided_by is not a member of this organization');

    const checklistRoute = readFileSync('app/api/org/[orgId]/grants/[grantId]/checklist/route.ts', 'utf8');
    expect(checklistRoute).toContain('requireOrgAccess');
    expect(checklistRoute).toContain('jsonOk');
    expect(checklistRoute).not.toContain('createAdminClient');
  });

  it('pledge routes no-store sensitive money views and await generated-task sync', () => {
    const pledgesRoute = readFileSync('app/api/org/[orgId]/pledges/route.ts', 'utf8');
    expect(pledgesRoute).toContain("requireOrgAccess(orgId, 'member')");
    expect(pledgesRoute).toContain('jsonOk');
    expect(pledgesRoute).toContain('Number.isFinite(requestedLimit)');
    expect(pledgesRoute).not.toContain('createServerClient');

    const pledgeDetailRoute = readFileSync('app/api/org/[orgId]/pledges/[pledgeId]/route.ts', 'utf8');
    expect(pledgeDetailRoute).toContain('requireOrgAccess');
    expect(pledgeDetailRoute).toContain('jsonOk');
    expect(pledgeDetailRoute).toContain(".eq('org_id', orgId).order('created_at'");
    expect(pledgeDetailRoute).toContain('deleted_by: access.context.principal.userId');
    expect(pledgeDetailRoute).not.toContain('createServerClient');

    const installmentRoute = readFileSync(
      'app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts',
      'utf8'
    );
    expect(installmentRoute).toContain('requireOrgAccess');
    expect(installmentRoute).toContain('jsonOk');
    expect(installmentRoute).toContain('await repository.syncInstallmentTasks');
    expect(installmentRoute).not.toContain('createAdminClient');
    expect(installmentRoute).not.toContain('createServerClient');
    expect(installmentRoute).not.toContain('Fire-and-forget');

    const cancelRoute = readFileSync('app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts', 'utf8');
    expect(cancelRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(cancelRoute).toContain('createPledgeRepository');
    expect(cancelRoute).toContain('jsonOk');
    expect(cancelRoute).not.toContain('createAdminClient');
    expect(cancelRoute).not.toContain('createServerClient');
    expect(cancelRoute).not.toContain('waiverError');
    expect(cancelRoute).not.toContain('eventError');
    expect(cancelRoute).not.toContain('instError');
    expect(cancelRoute).not.toContain('cancelGeneratedTasks');
    expect(cancelRoute).not.toContain('Fire-and-forget');
  });

  it('workflow routes no-store obligation data and check generated task side effects', () => {
    const templatesRoute = readFileSync('app/api/org/[orgId]/workflow-templates/route.ts', 'utf8');
    expect(templatesRoute).toContain('requireOrgAccess');
    expect(templatesRoute).toContain('jsonOk');
    expect(templatesRoute).not.toContain('createAdminClient');
    expect(templatesRoute).not.toContain('createServerClient');

    const configRoute = readFileSync('app/api/org/[orgId]/workflow-config/route.ts', 'utf8');
    expect(configRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(configRoute).toContain('jsonOk');
    expect(configRoute).not.toContain('createAdminClient');
    expect(configRoute).not.toContain('createServerClient');

    const labelsRoute = readFileSync('app/api/org/[orgId]/workflow-config/labels/route.ts', 'utf8');
    expect(labelsRoute).toContain('requireOrgAccess');
    expect(labelsRoute).not.toContain('createAdminClient');
    expect(labelsRoute).not.toContain('createServerClient');

    const workflowsRoute = readFileSync('app/api/org/[orgId]/workflows/route.ts', 'utf8');
    expect(workflowsRoute).toContain('requireOrgAccess');
    expect(workflowsRoute).toContain('createWorkflowRepository');
    expect(workflowsRoute).toContain('jsonOk');
    expect(workflowsRoute).toContain('Portfolio does not belong to this organization');
    expect(workflowsRoute).not.toContain('createAdminClient');
    expect(workflowsRoute).not.toContain('createServerClient');

    const workflowRepository = readFileSync('lib/api/repositories/workflows.ts', 'utf8');
    expect(workflowRepository).toContain(".eq('org_id', scope.orgId)");
    expect(workflowRepository).toContain('task_events');
    expect(workflowRepository).toContain('eventError');
    expect(workflowRepository).toContain("event_type: 'created'");

    const workflowTaskRoute = readFileSync(
      'app/api/org/[orgId]/workflows/[workflowId]/tasks/[workflowTaskId]/route.ts',
      'utf8'
    );
    expect(workflowTaskRoute).toContain('requireOrgAccess');
    expect(workflowTaskRoute).toContain('createWorkflowTaskRepository');
    expect(workflowTaskRoute).toContain('jsonOk');
    expect(workflowTaskRoute).not.toContain('createAdminClient');
    expect(workflowTaskRoute).not.toContain('createServerClient');
    expect(workflowRepository).toContain('taskUpdateError');
    expect(workflowRepository).toContain('eventError');
    expect(workflowRepository).toContain('syncError');
    expect(workflowRepository).toContain('maybeCompleteWorkflow(input.workflowId)');
  });

  it('invitation routes no-store admin data and roll back failed sends/audits', () => {
    const invitationsRoute = readFileSync('app/api/org/[orgId]/invitations/route.ts', 'utf8');
    const repository = readFileSync('lib/api/repositories/invitations.ts', 'utf8');
    expect(invitationsRoute).toContain('requireOrgAccess');
    expect(invitationsRoute).toContain('jsonOk');
    expect(invitationsRoute).not.toContain('createAdminClient');
    expect(repository).toContain('Only owners can invite another owner');
    expect(repository).toContain('auditError');
    expect(repository).toContain('emailError');
    expect(repository).toContain("status: 'cancelled'");

    const cancelRoute = readFileSync('app/api/org/[orgId]/invitations/[inviteId]/route.ts', 'utf8');
    expect(cancelRoute).toContain('requireOrgAccess');
    expect(cancelRoute).not.toContain('createAdminClient');
    expect(repository).toContain('auditError');
    expect(repository).toContain("status: 'pending'");
    expect(repository).toContain(".eq('org_id', scope.orgId)");

    const resendRoute = readFileSync('app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts', 'utf8');
    expect(resendRoute).toContain('requireOrgAccess');
    expect(resendRoute).not.toContain('createAdminClient');
    expect(repository).toContain('invite_resent');
    expect(repository).toContain('auditError');
    expect(repository).toContain('emailError');
    expect(repository).toContain('token: invite.token');
    expect(repository).toContain('expires_at: invite.expires_at');
  });

  it('module and member collection routes no-store authority data and protect owner changes', () => {
    const modulesRoute = readFileSync('app/api/org/[orgId]/modules/route.ts', 'utf8');
    expect(modulesRoute).toContain('requireOrgAccess');
    expect(modulesRoute).toContain('jsonOk');
    expect(modulesRoute).toContain('enableModule');
    expect(modulesRoute).not.toContain('createAdminClient');
    expect(modulesRoute).not.toContain('createServerClient');

    const membersRoute = readFileSync('app/api/org/[orgId]/members/route.ts', 'utf8');
    const membershipRepository = readFileSync('lib/api/repositories/memberships.ts', 'utf8');
    expect(membersRoute).toContain('requireOrgAccess');
    expect(membersRoute).toContain('jsonOk');
    expect(membersRoute).not.toContain('createAdminClient');
    expect(membershipRepository).toContain('Only owners can add another owner');
    expect(membershipRepository).toContain('Only owners can assign owner role');
    expect(membershipRepository).toContain('Cannot change the last owner role');
    expect(membershipRepository).toContain('User is already a member of this organization');
    expect(membershipRepository).toContain('auditError');
    expect(membershipRepository).toContain('role: existing.role');
  });

  it('implementation reviewer routes scope elevated capability operations to one org', () => {
    const route = readFileSync(
      'app/api/org/[orgId]/capabilities/implementation-reviewers/route.ts',
      'utf8'
    );
    const repository = readFileSync(
      'lib/api/repositories/implementation-reviewers.ts',
      'utf8'
    );
    expect(route).toContain('requireUserAccess');
    expect(route).toContain('createImplementationReviewerRepository');
    expect(route).toContain('jsonOk');
    expect(route).not.toContain('createAdminClient');
    expect(route).not.toContain('createServerClient');
    expect(repository).toContain(".eq('org_id', scope.orgId)");
    expect(repository).toContain(".not('accepted_at', 'is', null)");
    expect(repository).toContain("capability: 'implementation_reviewer'");
  });

  it('custom-field routes use shared guards and one org-scoped repository', () => {
    for (const routePath of [
      'app/api/org/[orgId]/custom-fields/route.ts',
      'app/api/org/[orgId]/custom-fields/[fieldId]/route.ts',
      'app/api/org/[orgId]/custom-fields/values/route.ts',
      'app/api/org/[orgId]/custom-fields/batch/route.ts',
    ]) {
      const route = readFileSync(routePath, 'utf8');
      expect(route, routePath).toContain('requireOrgAccess');
      expect(route, routePath).toContain('createCustomFieldRepository');
      expect(route, routePath).toContain('jsonOk');
      expect(route, routePath).not.toContain('createAdminClient');
      expect(route, routePath).not.toContain('createServerClient');
    }

    const repository = readFileSync('lib/api/repositories/custom-fields.ts', 'utf8');
    expect(repository).toContain(".eq('org_id', scope.orgId)");
    expect(repository).toContain('assertEntityScope');
    expect(repository).toContain('loadScopedEntityIds');
    expect(repository).toContain('runAutomationRulesForEvent');
  });

  it('org upload route uses the shared member guard and org-scoped storage repository', () => {
    const uploadRoute = readFileSync('app/api/org/[orgId]/upload/route.ts', 'utf8');
    expect(uploadRoute).toContain("requireOrgAccess(orgId, 'member')");
    expect(uploadRoute).toContain('createOrgUploadIngestionRepository');
    expect(uploadRoute).toContain('jsonOk');
    expect(uploadRoute).toContain('Holding does not belong to this organization');
    expect(uploadRoute).not.toContain('createAdminClient');
    expect(uploadRoute).not.toContain('createServerClient');
  });

  it('legacy org holding routes no-store retired endpoint responses', () => {
    for (const route of [
      'app/api/org/[orgId]/holdings/[holdingId]/route.ts',
      'app/api/org/[orgId]/holdings/request/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('"Cache-Control": "no-store"');
      expect(src, route).toContain('status: 410');
    }
  });

  it('compliance routes use canonical module/access checks and no-store responses', () => {
    const dashboardRoute = readFileSync('app/api/org/[orgId]/compliance/dashboard/route.ts', 'utf8');
    expect(dashboardRoute).toContain('requireOrgAccess');
    expect(dashboardRoute).toContain('jsonOk');
    expect(dashboardRoute).toContain("p_module: 'compliance'");
    expect(dashboardRoute).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(dashboardRoute).not.toContain('compliance_regulatory');

    const stateRoute = readFileSync('app/api/org/[orgId]/compliance/state-registrations/route.ts', 'utf8');
    expect(stateRoute).toContain('requireOrgAccess');
    expect(stateRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(stateRoute).toContain('stateRegistrationSchema');
    expect(stateRoute).toContain('jsonOk');
    expect(stateRoute).not.toContain('createServerClient');

    const disqualifiedRoute = readFileSync('app/api/org/[orgId]/compliance/disqualified-persons/route.ts', 'utf8');
    expect(disqualifiedRoute).toContain('requireOrgAccess');
    expect(disqualifiedRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(disqualifiedRoute).toContain('disqualifiedPersonSchema');
    expect(disqualifiedRoute).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(disqualifiedRoute).toContain('end_date');
  });

  it('builder routes no-store generated code paths and fail closed on durable side effects', () => {
    for (const route of [
      'app/api/org/[orgId]/builder/chat/route.ts',
      'app/api/org/[orgId]/builder/proposals/route.ts',
      'app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts',
      'app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts',
      'app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(
        src.includes("'Cache-Control': 'no-store'") || src.includes('jsonOk'),
        route
      ).toBe(true);
    }

    const detailRoute = readFileSync('app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts', 'utf8');
    expect(detailRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(detailRoute).toContain('createOrgBuilderReadRepository');
    expect(detailRoute).not.toContain('createAdminClient');

    const chatRoute = readFileSync('app/api/org/[orgId]/builder/chat/route.ts', 'utf8');
    const chatRepository = readFileSync('lib/api/repositories/builder-chat.ts', 'utf8');
    expect(chatRoute).toContain("requireOrgAccess(orgId, 'admin')");
    expect(chatRoute).toContain('createOrgBuilderChatRepository');
    expect(chatRoute).not.toContain('createAdminClient');
    expect(chatRepository).toContain("event_type: 'ai_request'");
    expect(chatRepository).toContain('if (error) throw error');
    expect(chatRepository).toContain('saveSession');

    const applyRoute = readFileSync('app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts', 'utf8');
    const applyRepository = readFileSync('lib/api/repositories/builder-apply.ts', 'utf8');
    expect(applyRoute).toContain('createOrgBuilderApplyRepository');
    expect(applyRoute).not.toContain('createAdminClient');
    expect(applyRepository).toContain('eventError');
    expect(applyRepository).toContain('BuilderApplyError(eventError.message');
    expect(applyRepository).not.toContain('Failed to emit builder proposal_applied event');
  });
});
