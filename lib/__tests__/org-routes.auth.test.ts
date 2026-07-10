// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

describe('org-scoped route auth contracts', () => {
  it('organization dashboard requires org membership before admin reads and disables caching', () => {
    const src = readFileSync('app/api/org/[orgId]/dashboard/route.ts', 'utf8');

    expect(src).toContain('user_org_role');
    expect(src.indexOf('user_org_role')).toBeLessThan(src.indexOf('.from("organizations")'));
    expect(src).toContain('createAdminClient');
    expect(src).toContain('"Cache-Control": "no-store"');
  });

  it('organization metrics require view/edit access, scope writes to org holdings, and disable caching', () => {
    const src = readFileSync('app/api/org/[orgId]/metrics/route.ts', 'utf8');

    expect(src).toContain('user_org_role');
    expect(src).toContain('can_edit_org');
    expect(src).toContain('.eq("org_id", orgId)');
    expect(src).toContain('submitted_by_org_id: orgId');
    expect(src).toContain('"Cache-Control": "no-store"');
  });

  it('notification routes are user scoped and disable caching', () => {
    for (const route of [
      'app/api/org/[orgId]/notifications/route.ts',
      'app/api/org/[orgId]/notifications/[notificationId]/read/route.ts',
      'app/api/org/[orgId]/notifications/mark-all-read/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');

      expect(src, route).toContain('user_org_role');
      expect(src, route).toContain("recipient_user_id', user.id");
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }
  });

  it('member notification preferences can only be changed by the authenticated member', () => {
    const src = readFileSync('app/api/org/[orgId]/members/[userId]/notifications/route.ts', 'utf8');

    expect(src).toContain('user.id !== userId');
    expect(src).toContain('user_org_role');
    expect(src).toContain("'Cache-Control': 'no-store'");
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

      expect(src, route).toContain(route.includes('tasks/summary') ? 'user_org_role' : 'getOrgAccess');
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }

    const tasksRoute = readFileSync('app/api/org/[orgId]/tasks/route.ts', 'utf8');
    expect(tasksRoute).toContain('Number.isFinite(requestedLimit)');
  });

  it('manual task creation validates entity links and rolls back partial writes', () => {
    const src = readFileSync('app/api/org/[orgId]/tasks/route.ts', 'utf8');

    expect(src).toContain('TASK_ENTITY_TYPES');
    expect(src).toContain('assertEntityLinkInOrg');
    expect(src).toContain('DIRECT_ORG_ENTITY_TABLES');
    expect(src).toContain('GRANT_CHILD_ENTITY_TABLES');
    expect(src).toContain('await adminClient.from(\'tasks\').delete()');
    expect(src).toContain('linkError');
    expect(src).toContain('eventError');
  });

  it('task status/comment mutations check audit writes and scope grant milestone sync', () => {
    const commentsRoute = readFileSync('app/api/org/[orgId]/tasks/[taskId]/comments/route.ts', 'utf8');
    expect(commentsRoute).toContain('eventError');
    expect(commentsRoute).toContain("from('task_comments').delete()");

    const detailRoute = readFileSync('app/api/org/[orgId]/tasks/[taskId]/route.ts', 'utf8');
    expect(detailRoute).toContain('eventError');
    expect(detailRoute).toContain('before_values: existing');

    const completeRoute = readFileSync('app/api/org/[orgId]/tasks/[taskId]/complete/route.ts', 'utf8');
    expect(completeRoute).toContain('syncGrantMilestoneCompletion');
    expect(completeRoute).toContain(".eq('org_id', orgId)");
    expect(completeRoute).toContain(".eq('grants.org_id', orgId)");
    expect(completeRoute).toContain('eventError');

    const reopenRoute = readFileSync('app/api/org/[orgId]/tasks/[taskId]/reopen/route.ts', 'utf8');
    expect(reopenRoute).toContain('eventError');
    expect(reopenRoute).toContain('status: existing.status');
  });

  it('donor routes protect PII, disable caching, and preserve contribution history on delete', () => {
    for (const route of [
      'app/api/org/[orgId]/donors/route.ts',
      'app/api/org/[orgId]/donors/[donorId]/route.ts',
    ]) {
      const src = readFileSync(route, 'utf8');
      expect(src, route).toContain('isOrgOperator');
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }

    const detailRoute = readFileSync('app/api/org/[orgId]/donors/[donorId]/route.ts', 'utf8');
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
    expect(receiptRoute).toContain('"Cache-Control": "no-store"');
    expect(receiptRoute).toContain('createAdminClient');
    expect(receiptRoute).toContain('"create_contribution_receipt_acknowledgment"');
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
      expect(src, route).toContain("'Cache-Control': 'no-store'");
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
    expect(pdfRoute).toContain('updateError');
    expect(pdfRoute).toContain(".remove([storagePath])");
    expect(pdfRoute).toContain('createSignedUrl');
  });

  it('org admin routes use no-store, soft delete, and durable audit for membership changes', () => {
    const auditRoute = readFileSync('app/api/org/[orgId]/audit/route.ts', 'utf8');
    expect(auditRoute).toContain("'Cache-Control': 'no-store'");
    expect(auditRoute).toContain('Number.isFinite(requestedLimit)');

    const orgRoute = readFileSync('app/api/org/[orgId]/route.ts', 'utf8');
    expect(orgRoute).toContain("'Cache-Control': 'no-store'");
    expect(orgRoute).toContain('deleted_at');
    expect(orgRoute).toContain('deleted_by');
    expect(orgRoute).toContain('is_active: false');
    expect(orgRoute).not.toContain("from('organizations').delete()");

    const memberRoute = readFileSync('app/api/org/[orgId]/members/[userId]/route.ts', 'utf8');
    expect(memberRoute).toContain("'Cache-Control': 'no-store'");
    expect(memberRoute).toContain('countActiveOwners');
    expect(memberRoute).toContain('Cannot change the last owner role');
    expect(memberRoute).toContain('Cannot remove the last owner');
    expect(memberRoute).toContain('auditError');
    expect(memberRoute).toContain('deleted_at: removedAt');
    expect(memberRoute).toContain('deleted_at: null');
    expect(memberRoute).not.toContain(".delete()");
  });

  it('compliance and grant calendars avoid stale obligation views', () => {
    const complianceRoute = readFileSync('app/api/org/[orgId]/compliance/filing-calendar/route.ts', 'utf8');
    expect(complianceRoute).toContain("'Cache-Control': 'no-store'");
    expect(complianceRoute).toContain('Number.isFinite(requestedDays)');
    expect(complianceRoute).toContain('taskSyncError');
    expect(complianceRoute).toContain('completeGeneratedTasks');
    expect(complianceRoute).toContain('cancelGeneratedTasks');
    expect(complianceRoute).not.toContain('Fire-and-forget');

    const grantCalendarRoute = readFileSync('app/api/org/[orgId]/grants/calendar/route.ts', 'utf8');
    expect(grantCalendarRoute).toContain("'Cache-Control': 'no-store'");
    expect(grantCalendarRoute).toContain('Number.isFinite(requestedDaysAhead)');
    expect(grantCalendarRoute).toContain('Math.min(requestedDaysAhead, 365)');
  });

  it('grant routes use no-store, safe inputs, and checked lifecycle side effects', () => {
    const grantsRoute = readFileSync('app/api/org/[orgId]/grants/route.ts', 'utf8');
    expect(grantsRoute).toContain("'Cache-Control': 'no-store'");
    expect(grantsRoute).toContain('Number.isFinite(requestedPage)');
    expect(grantsRoute).toContain('Number.isFinite(numericRequestedAmount)');
    expect(grantsRoute).toContain('LIFECYCLE_STAGES');
    expect(grantsRoute).toContain('internal_owner_id is not a member of this organization');
    expect(grantsRoute).toContain("rpc('create_grant_with_foundation_records'");
    expect(grantsRoute).toContain('Failed to create grant atomically');
    expect(grantsRoute).not.toContain('historyError');
    expect(grantsRoute).not.toContain('workflowError');

    const grantDetailRoute = readFileSync('app/api/org/[orgId]/grants/[grantId]/route.ts', 'utf8');
    expect(grantDetailRoute).toContain("'Cache-Control': 'no-store'");
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
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }

    const decisionsRoute = readFileSync('app/api/org/[orgId]/grants/[grantId]/decisions/route.ts', 'utf8');
    expect(decisionsRoute).toContain('decisionSchema');
    expect(decisionsRoute).toContain('requireUserInOrg');
    expect(decisionsRoute).toContain('decided_by is not a member of this organization');
  });

  it('pledge routes no-store sensitive money views and await generated-task sync', () => {
    const pledgesRoute = readFileSync('app/api/org/[orgId]/pledges/route.ts', 'utf8');
    expect(pledgesRoute).toContain("'Cache-Control': 'no-store'");
    expect(pledgesRoute).toContain('Number.isFinite(requestedLimit)');

    const pledgeDetailRoute = readFileSync('app/api/org/[orgId]/pledges/[pledgeId]/route.ts', 'utf8');
    expect(pledgeDetailRoute).toContain("'Cache-Control': 'no-store'");
    expect(pledgeDetailRoute).toContain(".eq('org_id', orgId).order('created_at'");
    expect(pledgeDetailRoute).toContain('deleted_by: user.id');

    const installmentRoute = readFileSync(
      'app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts',
      'utf8'
    );
    expect(installmentRoute).toContain("'Cache-Control': 'no-store'");
    expect(installmentRoute).toContain('await completeGeneratedTasks');
    expect(installmentRoute).toContain('await cancelGeneratedTasks');
    expect(installmentRoute).not.toContain('Fire-and-forget');

    const cancelRoute = readFileSync('app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts', 'utf8');
    expect(cancelRoute).toContain("'Cache-Control': 'no-store'");
    expect(cancelRoute).toContain("rpc('cancel_pledge_with_obligations'");
    expect(cancelRoute).not.toContain('waiverError');
    expect(cancelRoute).not.toContain('eventError');
    expect(cancelRoute).not.toContain('instError');
    expect(cancelRoute).not.toContain('cancelGeneratedTasks');
    expect(cancelRoute).not.toContain('Fire-and-forget');
  });

  it('workflow routes no-store obligation data and check generated task side effects', () => {
    const templatesRoute = readFileSync('app/api/org/[orgId]/workflow-templates/route.ts', 'utf8');
    expect(templatesRoute).toContain("'Cache-Control': 'no-store'");

    const workflowsRoute = readFileSync('app/api/org/[orgId]/workflows/route.ts', 'utf8');
    expect(workflowsRoute).toContain("'Cache-Control': 'no-store'");
    expect(workflowsRoute).toContain('Portfolio does not belong to this organization');
    expect(workflowsRoute).toContain(".eq('org_id', input.orgId)");
    expect(workflowsRoute).toContain('task_events');
    expect(workflowsRoute).toContain('eventError');
    expect(workflowsRoute).toContain("event_type: 'created'");

    const workflowTaskRoute = readFileSync(
      'app/api/org/[orgId]/workflows/[workflowId]/tasks/[workflowTaskId]/route.ts',
      'utf8'
    );
    expect(workflowTaskRoute).toContain("'Cache-Control': 'no-store'");
    expect(workflowTaskRoute).toContain('taskUpdateError');
    expect(workflowTaskRoute).toContain('eventError');
    expect(workflowTaskRoute).toContain('syncError');
    expect(workflowTaskRoute).toContain('maybeCompleteWorkflow(adminClient, orgId, workflowId)');
  });

  it('invitation routes no-store admin data and roll back failed sends/audits', () => {
    const invitationsRoute = readFileSync('app/api/org/[orgId]/invitations/route.ts', 'utf8');
    expect(invitationsRoute).toContain("'Cache-Control': 'no-store'");
    expect(invitationsRoute).toContain('Only owners can invite another owner');
    expect(invitationsRoute).toContain('auditError');
    expect(invitationsRoute).toContain('emailError');
    expect(invitationsRoute).toContain("status: 'cancelled'");

    const cancelRoute = readFileSync('app/api/org/[orgId]/invitations/[inviteId]/route.ts', 'utf8');
    expect(cancelRoute).toContain("'Cache-Control': 'no-store'");
    expect(cancelRoute).toContain('auditError');
    expect(cancelRoute).toContain("status: 'pending'");
    expect(cancelRoute).toContain(".eq('org_id', orgId)");

    const resendRoute = readFileSync('app/api/org/[orgId]/invitations/[inviteId]/resend/route.ts', 'utf8');
    expect(resendRoute).toContain("'Cache-Control': 'no-store'");
    expect(resendRoute).toContain('invite_resent');
    expect(resendRoute).toContain('auditError');
    expect(resendRoute).toContain('emailError');
    expect(resendRoute).toContain('token: invite.token');
    expect(resendRoute).toContain('expires_at: invite.expires_at');
  });

  it('module and member collection routes no-store authority data and protect owner changes', () => {
    const modulesRoute = readFileSync('app/api/org/[orgId]/modules/route.ts', 'utf8');
    expect(modulesRoute).toContain("'Cache-Control': 'no-store'");
    expect(modulesRoute).toContain('isWorkspaceManager');
    expect(modulesRoute).toContain('enableModule');

    const membersRoute = readFileSync('app/api/org/[orgId]/members/route.ts', 'utf8');
    expect(membersRoute).toContain("'Cache-Control': 'no-store'");
    expect(membersRoute).toContain('Only owners can add another owner');
    expect(membersRoute).toContain('Only owners can assign owner role');
    expect(membersRoute).toContain('Cannot change the last owner role');
    expect(membersRoute).toContain('User is already a member of this organization');
    expect(membersRoute).toContain('auditError');
    expect(membersRoute).toContain('role: existing.role');
  });

  it('org upload route no-stores responses and checks upload status transitions', () => {
    const uploadRoute = readFileSync('app/api/org/[orgId]/upload/route.ts', 'utf8');
    expect(uploadRoute).toContain('"Cache-Control": "no-store"');
    expect(uploadRoute).toContain('markUploadStatus');
    expect(uploadRoute).toContain('extractionFailures === chunks.length');
    expect(uploadRoute).toContain('file.name.replace');
    expect(uploadRoute).toContain('Failed to mark upload failed');
    expect(uploadRoute).toContain('Holding does not belong to this organization');
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
    expect(dashboardRoute).toContain("'Cache-Control': 'no-store'");
    expect(dashboardRoute).toContain("p_module: 'compliance'");
    expect(dashboardRoute).toContain(".is('deleted_at', null)");
    expect(dashboardRoute).not.toContain('compliance_regulatory');

    const stateRoute = readFileSync('app/api/org/[orgId]/compliance/state-registrations/route.ts', 'utf8');
    expect(stateRoute).toContain("'Cache-Control': 'no-store'");
    expect(stateRoute).toContain('is_org_admin');

    const disqualifiedRoute = readFileSync('app/api/org/[orgId]/compliance/disqualified-persons/route.ts', 'utf8');
    expect(disqualifiedRoute).toContain("'Cache-Control': 'no-store'");
    expect(disqualifiedRoute).toContain('isWorkspaceManager');
    expect(disqualifiedRoute).toContain(".is('deleted_at', null)");
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
      expect(src, route).toContain("'Cache-Control': 'no-store'");
    }

    const detailRoute = readFileSync('app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts', 'utf8');
    expect(detailRoute).toContain('is_org_admin');
    expect(detailRoute).not.toContain('user_org_role');

    const chatRoute = readFileSync('app/api/org/[orgId]/builder/chat/route.ts', 'utf8');
    expect(chatRoute).toContain('eventError');
    expect(chatRoute).toContain('return json({ error: eventError.message }, { status: 500 })');
    expect(chatRoute).toContain('sessionError');
    expect(chatRoute).toContain('if (sessionError) throw sessionError');

    const applyRoute = readFileSync('app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts', 'utf8');
    expect(applyRoute).toContain('eventErr');
    expect(applyRoute).toContain('error: eventErr.message');
    expect(applyRoute).not.toContain('Failed to emit builder proposal_applied event');
  });
});
