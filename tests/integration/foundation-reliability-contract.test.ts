// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

function src(path: string) {
  return readFileSync(path, 'utf8');
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? routeFiles(path) : path.endsWith('route.ts') ? [path] : [];
  });
}

describe('foundation reliability contracts', () => {
  it('portfolio-scoped APIs explicitly declare private cache behavior', () => {
    for (const path of routeFiles('app/api/portfolio/[id]')) {
      const route = src(path);
      expect(route, path).toMatch(
        /no-store|s-maxage|stale-while-revalidate|@\/lib\/api\/responses/
      );
    }
  });

  it('scopes grant budget access to the URL portfolio through the shared guard', () => {
    const route = src('app/api/portfolio/[id]/grants/[grantId]/budget/route.ts');

    expect(route).toContain('requireGrantInPortfolio');
    expect(route).toContain('requirePortfolioAccess');
    expect(route).toMatch(/from\('grants'\)[\s\S]{0,220}\.eq\('id', grantId\)[\s\S]{0,120}\.eq\('portfolio_id', portfolioId\)/);
    expect(route.match(/requireGrantInPortfolio\(sb, grantId, portfolioId\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(route).toContain('jsonOk');
    expect(route).not.toContain('createAdminClient');
  });

  it('uses canonical valuation columns from db/migrations', () => {
    const listRoute = src('app/api/portfolio/[id]/holdings/[holdingId]/valuations/route.ts');
    const singleRoute = src('app/api/portfolio/[id]/holdings/[holdingId]/valuations/[valuationId]/route.ts');
    const schema = src('lib/schemas/investment.ts');

    expect(listRoute).toContain(".order('valued_at'");
    expect(listRoute).toContain('valued_at: validated.valued_at');
    expect(listRoute).toContain('value: validated.value');
    expect(listRoute).toContain("'Cache-Control': 'no-store'");
    expect(listRoute).not.toMatch(/as_of_date:\s*validated|nav:\s*validated|valuation_source:\s*validated/);
    expect(singleRoute).toContain('updateData.valued_at');
    expect(singleRoute).toContain('updateData.value');
    expect(singleRoute).toContain("'Cache-Control': 'no-store'");
    expect(schema).toContain('valued_at:');
    expect(schema).toContain('value:');
  });

  it('does not pass stale p_user_id to can_edit_portfolio', () => {
    for (const path of [
      'app/api/portfolio/[id]/holdings/[holdingId]/milestones/route.ts',
      'app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts',
      'app/api/portfolio/[id]/holdings/[holdingId]/transactions/route.ts',
      'app/api/portfolio/[id]/holdings/[holdingId]/transactions/[transactionId]/route.ts',
      'app/api/portfolio/[id]/holdings/[holdingId]/valuations/route.ts',
      'app/api/portfolio/[id]/holdings/[holdingId]/valuations/[valuationId]/route.ts',
    ]) {
      expect(src(path), path).not.toContain('p_user_id');
    }
  });

  it('never publicly caches generated board/report document details', () => {
    const route = src('app/api/portfolio/[id]/reports/documents/[documentId]/route.ts');

    expect(route).toContain("'Cache-Control': 'no-store'");
    expect(route).not.toContain('Cache-Control\': \'public');
    expect(route).not.toContain('s-maxage');
  });

  it('keeps report template and schedule APIs private and explicitly authorized', () => {
    for (const path of [
      'app/api/portfolio/[id]/reports/templates/route.ts',
      'app/api/portfolio/[id]/reports/templates/[templateId]/route.ts',
      'app/api/portfolio/[id]/reports/schedules/route.ts',
      'app/api/portfolio/[id]/reports/schedules/[scheduleId]/route.ts',
    ]) {
      const route = src(path);
      expect(route, path).toContain("'Cache-Control': 'no-store'");
      expect(route, path).toContain("rpc('can_view_portfolio'");
      expect(route, path).not.toContain('s-maxage');
      expect(route, path).not.toContain('public,');
    }
  });

  it('rolls back tax document uploads when primary metadata pointer update fails', () => {
    const route = src('app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route.ts');

    expect(route).toContain('pointerError');
    expect(route).toMatch(/from\('tax_documents'\)[\s\S]{0,120}\.delete\(\)[\s\S]{0,120}\.eq\('id', docRecord\.id\)/);
    expect(route).toMatch(/taxRepository\s*\.removeDocumentObject/);
  });

  it('locally reconciles QuickBooks grant exports', () => {
    const route = src('app/api/integrations/quickbooks/export/grants/route.ts');
    const repository = src('lib/api/repositories/quickbooks.ts');
    const migration = src('db/migrations/0041_task_workflow_foundation.sql');

    expect(migration).toContain('qb_exported_at');
    expect(migration).toContain('qb_journal_entry_id');
    expect(route).toContain('findJournalEntryByDocNumberAsync');
    expect(route).toContain("eventType: 'grants_export'");
    expect(route).toContain('reconcileGrantExport');
    expect(repository).toMatch(/from\('grants'\)[\s\S]{0,120}\.update\(\{[\s\S]*qb_exported_at[\s\S]*qb_journal_entry_id/);
  });

  it('QuickBooks money exports no-store responses and require durable sync logs', () => {
    const migration = src('db/migrations/0037_qb_sync_log.sql');
    const helper = src('lib/integrations/quickbooks/export-attempts.ts');
    const repository = src('lib/api/repositories/quickbooks.ts');

    expect(migration).toContain('create table if not exists qb_export_attempts');
    expect(migration).toContain('qb_export_attempts_active_unique');
    expect(migration).toContain("status in ('in_flight', 'succeeded')");
    expect(helper).toContain('claimQBExportAttempt');
    expect(helper).toContain('completeQBExportAttempt');
    expect(helper).toContain('failQBExportAttempt');

    for (const path of [
      'app/api/integrations/quickbooks/export/grants/route.ts',
      'app/api/integrations/quickbooks/export/contributions/route.ts',
    ]) {
      const route = src(path);
      expect(route, path).toContain('jsonOk');
      expect(route, path).toContain('jsonError');
      expect(route, path).toContain('claimExportAttempt');
      expect(route, path).toContain('completeExportAttempt');
      expect(route, path).toContain('failExportAttempt');
      expect(route, path).toContain('journalEntryMatchesExpected');
      expect(route, path).toContain('QuickBooks export already in flight');
      expect(route, path).not.toContain('Failed to write grants export sync log');
      expect(route, path).not.toContain('Failed to write contributions export sync log');
    }
    expect(repository).toContain('claimQBExportAttempt');
    expect(repository).toContain('if (error) throw error');
  });

  it('grant exports and generated letters do not silently drop durable side effects', () => {
    const grantExport = src('app/api/portfolio/[id]/grants/export/route.ts');
    expect(grantExport).toContain('requirePortfolioAccess');
    expect(grantExport).toContain('grantsError');
    expect(grantExport).toContain('milestonesResult');
    expect(grantExport).toContain("'Cache-Control': 'no-store'");
    expect(grantExport).not.toContain('createAdminClient');

    const letterGenerate = src('app/api/portfolio/[id]/letter/generate/route.ts');
    const documentRepository = src('lib/api/repositories/generated-documents.ts');
    expect(letterGenerate).toContain('requirePortfolioAccess');
    expect(letterGenerate).not.toContain('createSupabaseServerClient');
    expect(letterGenerate).toContain('await documents.saveLetter');
    expect(documentRepository).toContain('if (error) throw error');
    expect(documentRepository).toContain(".eq('document_type', 'letter')");
    expect(letterGenerate).toContain("'Cache-Control': 'no-store'");
  });

  it('widget preview saves require portfolio edit access and scope holding widgets', () => {
    const route = src('app/api/portfolio/[id]/widgets/save-preview/route.ts');
    const repository = src('lib/api/repositories/visualizations.ts');
    expect(route).toContain("requirePortfolioAccess(portfolioId, 'member')");
    expect(route).toContain('createPortfolioVisualizationRepository');
    expect(route).toContain('jsonOk');
    expect(route).not.toContain('createClient');
    expect(repository).toContain(".eq('portfolio_id', scope.portfolioId)");
    expect(repository).toContain('PortfolioWidgetHoldingNotFoundError');
  });

  it('generated task automation checks task and event writes', () => {
    const writer = src('lib/tasks/automation/task-writer.ts');
    expect(writer).toContain('taskFetchError');
    expect(writer).toContain('existingError');
    expect(writer).toContain('linkError');
    expect(writer).toContain('updateError');
    expect(writer).toContain('eventError');
    expect(writer).toContain('if (eventError) throw eventError');
    expect(writer).toContain("from('tasks').delete().eq('id', task.id).eq('org_id', input.orgId)");
  });

  it('tax profile mutations roll back when canonical tax year sync fails', () => {
    const route = src('app/api/portfolio/[id]/tax/profile/route.ts');
    expect(route).toContain('taxYearError');
    expect(route).toContain("from('tax_profiles')");
    expect(route).toContain('.delete()');
    expect(route).toContain('rollback_error');
    expect(route).toContain('existing.filing_status');
    expect(route).not.toContain("Don't fail the whole request");
  });

  it('tax profile mutations always create the canonical tax year row', () => {
    const route = src('app/api/portfolio/[id]/tax/profile/route.ts');
    const repository = src('lib/api/repositories/tax.ts');

    expect(route.match(/taxRepository\.syncTaxYear\(/g)?.length).toBe(2);
    expect(repository).toContain("from('tax_years')");
    expect(repository).toContain('.upsert({');
    expect(repository).toContain('portfolio_id: scope.portfolioId');
    expect(route).toContain('Always ensure the canonical tax_years row exists');
    expect(route).toContain('adjustedGrossIncome: created.estimated_agi ?? null');
    expect(route).toContain('adjustedGrossIncome: updated.estimated_agi ?? null');
    expect(route).not.toContain('if (validated.estimated_agi || validated.filing_status)');
    expect(route).not.toContain('if (validated.estimated_agi !== undefined || validated.filing_status !== undefined)');
  });

  it('disqualified-person termination keeps active state consistent', () => {
    const route = src('app/api/org/[orgId]/compliance/disqualified-persons/route.ts');
    const migration = src('db/migrations/0016_compliance.sql');

    expect(route).toMatch(/\.update\(\{\s*end_date:[\s\S]{0,80}is_active:\s*false\s*\}\)/);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION sync_disqualified_person_active_state');
    expect(migration).toContain('NEW.is_active := false');
    expect(migration).toContain('CREATE TRIGGER trg_disqualified_persons_active_state');
  });

  it('expenditure-responsibility mutations use portfolio guards and strict fields', () => {
    const route = src('app/api/portfolio/[id]/compliance/er-grants/route.ts');

    expect(route).toContain('requirePortfolioAccess');
    expect(route).toContain('createErGrantSchema');
    expect(route).toContain('erFieldsSchema');
    expect(route).toContain(".eq('portfolio_id', portfolioId)");
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(route).toContain('}).strict()');
  });

  it('portfolio milestone mutations scope joined grants and use one atomic task-sync RPC', () => {
    const route = src('app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts');
    const repository = src('lib/api/repositories/grants.ts');
    const migration = src('db/migrations/0041_task_workflow_foundation.sql');
    expect(route).toContain('grants!inner(holding_id, portfolio_id)');
    expect(route).toContain('grantDetails.portfolio_id !== portfolioId');
    expect(route).toContain("requirePortfolioAccess(portfolioId, 'member')");
    expect(route).toContain('updateMilestoneWithTaskSync');
    expect(route).not.toContain('createAdminClient');
    expect(repository).toContain("'update_grant_milestone_with_task_sync'");
    expect(repository).toContain('p_expected_org_id: scope.orgId');
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public.update_grant_milestone_with_task_sync'
    );
    expect(migration).toContain('WITH settled_tasks AS');
    expect(migration).toContain('UPDATE public.tasks');
    expect(migration).toContain('INSERT INTO public.task_events');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.update_grant_milestone_with_task_sync'
    );
    expect(route).not.toContain('fire-and-forget');
    expect(route).toContain('jsonOk');
  });

  it('grant milestone overdue state is computed from dates instead of stored as workflow status', () => {
    const migration = src('db/migrations/0041_task_workflow_foundation.sql');
    const schema = src('lib/schemas/grant.ts');
    const milestoneHelper = src('lib/grants/milestones.ts');
    const listRoute = src('app/api/portfolio/[id]/holdings/[holdingId]/milestones/route.ts');
    const singleRoute = src('app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts');
    const exportRoute = src('app/api/portfolio/[id]/grants/export/route.ts');
    const grantProducer = src('lib/tasks/automation/producers/grants.ts');
    const toolDefinitions = src('lib/ai/assistant/tool-definitions/grants.ts');
    const grantExecutor = src('lib/ai/assistant/executors/grants.ts');

    const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS public.grant_milestones');
    expect(tableStart).toBeGreaterThan(-1);
    const tableBlock = migration.slice(tableStart, migration.indexOf(');', tableStart));
    expect(tableBlock).toContain("CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))");
    expect(tableBlock).not.toContain("'overdue'");
    expect(migration).toContain("gm.status NOT IN ('completed', 'cancelled') AND gm.due_date IS NOT NULL AND gm.due_date < CURRENT_DATE");

    const storedSchema = schema.slice(
      schema.indexOf('export const milestoneStatusSchema'),
      schema.indexOf('export type MilestoneStatus')
    );
    expect(storedSchema).not.toContain("'overdue'");
    expect(schema).toContain('milestoneDisplayStatusSchema');
    expect(schema).toContain("overdue: 'Overdue'");
    expect(milestoneHelper).toContain('milestoneDisplayStatus');
    expect(milestoneHelper).toContain("dueDate < todayIso");

    expect(listRoute).toContain('withMilestoneDisplayStatus');
    expect(singleRoute).toContain('withMilestoneDisplayStatus');
    expect(exportRoute).toContain('withMilestoneDisplayStatus');
    expect(grantProducer).toContain("const MILESTONE_OPEN_STATUSES = ['pending', 'in_progress']");
    expect(toolDefinitions).toContain("enum: ['pending', 'in_progress', 'completed', 'cancelled']");
    expect(grantExecutor).toContain("status === 'overdue'");
  });

  it('grant creation uses the atomic foundation-records RPC', () => {
    const route = src('app/api/org/[orgId]/grants/route.ts');
    const repository = src('lib/api/repositories/grants.ts');
    const migration = src('db/migrations/0041_task_workflow_foundation.sql');

    expect(route).toContain('createWithFoundationRecords');
    expect(repository).toContain("rpc('create_grant_with_foundation_records'");
    expect(route).not.toMatch(/from\('holdings'\)[\s\S]{0,180}\.insert\(/);
    expect(route).not.toMatch(/from\('grants'\)[\s\S]{0,180}\.insert\(/);
    expect(route).not.toContain("from('grant_status_history').insert");
    expect(route).not.toContain("from('workflow_instances').insert");

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_grant_with_foundation_records');
    expect(migration).toContain('INSERT INTO public.holdings');
    expect(migration).toContain('INSERT INTO public.grants');
    expect(migration).toContain('INSERT INTO public.grant_status_history');
    expect(migration).toContain('INSERT INTO public.workflow_instances');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_grant_with_foundation_records');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.create_grant_with_foundation_records');
  });

  it('bulk grant transitions document partial mode and support safe preview/all-or-none modes', () => {
    const route = src('app/api/org/[orgId]/grants/bulk-transition/route.ts');
    const repository = src('lib/api/repositories/grants.ts');
    const page = src('components/grants/list/GrantsPage.tsx');
    const decisionQueue = src('components/grants/BulkDecisionQueue.tsx');
    const migration = src('db/migrations/0047_grant_lifecycle_transition_rpc.sql');

    expect(route).toContain('dry_run');
    expect(route).toContain('rollback_on_error');
    expect(route).toContain("mode: 'partial'");
    expect(route).toContain('not rolled back in partial mode');
    expect(route).toContain('transitionGrantBatch');
    expect(route).not.toContain('repository.transitionLifecycleBatch');
    expect(src('lib/grants/lifecycle.ts')).toContain('repository.transitionLifecycleBatch');
    expect(repository).toContain("rpc('transition_grant_lifecycle_batch'");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.transition_grant_lifecycle_batch');
    expect(migration).toContain('PERFORM public.transition_grant_lifecycle');
    expect(page).toContain('rollback_on_error: true');
    expect(page).toContain('will be moved as one batch');
    expect(decisionQueue).toContain('submitted as one batch');
  });

  it('pledge cancellation uses a transactional obligations RPC', () => {
    const route = src('app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts');
    const repository = src('lib/api/repositories/pledges.ts');
    const migration = src('db/migrations/0041_task_workflow_foundation.sql');

    expect(route).toContain('cancelPledge');
    expect(repository).toContain("rpc('cancel_pledge_with_obligations'");
    expect(route).not.toContain("from('pledges')");
    expect(route).not.toContain("from('pledge_installments')");
    expect(route).not.toContain("from('pledge_events')");
    expect(route).not.toContain('cancelGeneratedTasks');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.cancel_pledge_with_obligations');
    expect(migration).toContain('UPDATE public.pledges');
    expect(migration).toContain('UPDATE public.pledge_installments');
    expect(migration).toContain('INSERT INTO public.pledge_events');
    expect(migration).toContain('UPDATE public.tasks');
    expect(migration).toContain('INSERT INTO public.task_events');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.cancel_pledge_with_obligations');
  });

  it('pledge list KPIs are aggregated in SQL instead of unbounded route reads', () => {
    const route = src('app/api/org/[orgId]/pledges/route.ts');
    const migration = src('db/migrations/0038_pledge_tracking.sql');
    const getRoute = route.slice(
      route.indexOf('export async function GET'),
      route.indexOf('export async function POST')
    );

    expect(getRoute).toContain("rpc('get_pledge_dashboard_metrics'");
    expect(getRoute).not.toContain("from('pledge_installments')");
    expect(getRoute).not.toMatch(/from\('pledges'\)[\s\S]{0,120}\.select\('id, total_amount, status'\)/);
    expect(getRoute).toContain("q = q.eq('pipeline_status', pipelineFilter)");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_pledge_dashboard_metrics');
    expect(migration).toContain('SUM(total_amount)');
    expect(migration).toContain('jsonb_agg');
  });

  it('receipt generation updates acknowledgment and contribution state atomically', () => {
    const route = src('app/api/org/[orgId]/contributions/[id]/receipt/route.ts');
    const repository = src('lib/api/repositories/contribution-receipts.ts');
    const migration = src('db/migrations/0015_acknowledgments.sql');
    const postRoute = route.slice(0, route.indexOf('// GET /api/org/[orgId]/contributions/[id]/receipt'));

    expect(route).toContain('createContributionReceiptRepository');
    expect(repository).toContain("'create_contribution_receipt_acknowledgment'");
    expect(postRoute).not.toContain('contributionUpdateError');
    expect(postRoute).not.toContain('from("acknowledgment_letters")');
    expect(postRoute).not.toContain('.delete()');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_contribution_receipt_acknowledgment');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('INSERT INTO public.acknowledgment_letters');
    expect(migration).toContain('UPDATE public.contributions_received');
    expect(migration).toContain('public.generate_receipt_number(p_org_id)');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.create_contribution_receipt_acknowledgment');
  });

  it('board-grade operations write org audit events with a shared taxonomy', () => {
    const auditHelper = src('lib/audit/org-audit.ts');
    const receiptRoute = src('app/api/org/[orgId]/contributions/[id]/receipt/route.ts');
    const receiptRepository = src('lib/api/repositories/contribution-receipts.ts');
    const decisionRoute = src('app/api/org/[orgId]/grants/[grantId]/decisions/route.ts');
    const grantRepository = src('lib/api/repositories/grants.ts');
    const pfRoute = src('app/api/portfolio/[id]/compliance/990pf-export/route.ts');
    const complianceRepository = src('lib/api/repositories/compliance.ts');
    const grantExecutor = src('lib/ai/assistant/executors/grants.ts');
    const assistantExecutor = src('lib/ai/assistant/executors/tools/record-grant-payment.ts');
    const assistantCapabilities = src('lib/api/repositories/ai-tools.ts');

    expect(auditHelper).toContain('ORG_AUDIT_ACTIONS');
    expect(auditHelper).toContain('GRANT_DECISION_RECORDED');
    expect(auditHelper).toContain('GRANT_PAYMENT_RECORDED');
    expect(auditHelper).toContain('CONTRIBUTION_RECEIPT_GENERATED');
    expect(auditHelper).toContain('COMPLIANCE_990PF_EXPORTED');
    expect(auditHelper).toContain("from('org_audit_log').insert");

    expect(receiptRoute).toContain('createContributionReceiptRepository');
    expect(receiptRepository).toContain('writeOrgAuditEvent');
    expect(receiptRepository).toContain('ORG_AUDIT_ACTIONS.CONTRIBUTION_RECEIPT_GENERATED');
    expect(decisionRoute).toContain('recordDecision');
    expect(grantRepository).toContain('writeOrgAuditEvent');
    expect(grantRepository).toContain('ORG_AUDIT_ACTIONS.GRANT_DECISION_RECORDED');
    expect(pfRoute).toContain('record990PfExport');
    expect(pfRoute).toContain("select('id, name')");
    expect(pfRoute).not.toContain('createAdminClient');
    expect(complianceRepository).toContain('writeOrgAuditEvent');
    expect(complianceRepository).toContain('ORG_AUDIT_ACTIONS.COMPLIANCE_990PF_EXPORTED');
    expect(assistantExecutor).toContain(
      'recordGrantPayment(supabase, args, portfolioId, capabilities)'
    );
    expect(grantExecutor).toContain('capabilities.recordGrantPaymentAudit');
    expect(assistantCapabilities).toContain('ORG_AUDIT_ACTIONS.GRANT_PAYMENT_RECORDED');
    expect(assistantCapabilities).toContain(".eq('org_id', scope.orgId)");
    expect(assistantCapabilities).toContain(".eq('portfolio_id', scope.portfolioId)");
    expect(grantExecutor).toContain('operation: \'insert\'');
    expect(grantExecutor).toContain('operation: \'update\'');
  });

  it('contribution delete rejects pledge-linked contributions before deleting', () => {
    const route = src('app/api/org/[orgId]/contributions/[id]/route.ts');
    const migration = src('db/migrations/0038_pledge_tracking.sql');
    const deleteRoute = route.slice(route.indexOf('export async function DELETE'));

    expect(deleteRoute).toContain('pledge_installment_id');
    expect(deleteRoute).toContain("from(\"pledge_installments\")");
    expect(deleteRoute).toContain('{ status: 409 }');
    expect(deleteRoute.indexOf("from(\"pledge_installments\")")).toBeLessThan(deleteRoute.indexOf(".delete()"));
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.prevent_pledge_linked_contribution_delete');
    expect(migration).toContain('BEFORE DELETE ON public.contributions_received');
    expect(migration).toContain('pi.contribution_id = OLD.id');
  });

  it('donor contributions enforce positive amounts at the database layer', () => {
    const migration = src('db/migrations/0014_donors.sql');
    const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS contributions_received');
    expect(tableStart).toBeGreaterThan(-1);
    const tableBlock = migration.slice(tableStart, migration.indexOf(');', tableStart));

    expect(tableBlock).toMatch(/amount\s+numeric\(20,2\)\s+NOT NULL\s+CHECK\s*\(\s*amount\s*>\s*0\s*\)/);
  });

  it('grant document delete removes the DB pointer before storage cleanup', () => {
    const route = src('app/api/portfolio/[id]/grants/[grantId]/documents/route.ts');
    const repository = src('lib/api/repositories/grants.ts');
    const deleteStart = repository.indexOf('async deleteDocument');
    expect(deleteStart).toBeGreaterThan(-1);
    const deleteOperation = repository.slice(deleteStart);

    const dbDeleteIndex = deleteOperation.indexOf('.delete()');
    const storageRemoveIndex = deleteOperation.indexOf('.remove([document.storage_path])');
    expect(dbDeleteIndex).toBeGreaterThan(-1);
    expect(storageRemoveIndex).toBeGreaterThan(-1);
    expect(dbDeleteIndex).toBeLessThan(storageRemoveIndex);

    expect(route).toContain('requirePortfolioAccess');
    expect(route).toContain('createGrantDocumentRepository');
    expect(route).toContain('storage_cleanup_pending');
    expect(route).not.toContain('createAdminClient');
    expect(deleteOperation).toContain(".eq('id', documentId)");
    expect(deleteOperation).toContain(".eq('grant_id', grantId)");
    expect(deleteOperation).toContain('assertScopedPath');
    expect(deleteOperation).not.toMatch(/storageDeleteError\) throw storageDeleteError/);
  });

  it('payout and 990-PF endpoints use qualifying distributions and shared payout math', () => {
    const payoutRoute = src('app/api/portfolio/[id]/compliance/payout/route.ts');
    const exportRoute = src('app/api/portfolio/[id]/compliance/990pf-export/route.ts');
    const helper = src('lib/compliance/payout.ts');

    for (const route of [payoutRoute, exportRoute]) {
      expect(route).toContain("from('qualifying_distributions')");
      expect(route).toContain('calculatePayout');
      expect(route).not.toContain("from('tax_contributions')");
      expect(route).not.toContain('deductible_amount');
      expect(route).not.toContain('description_of_property');
    }

    expect(payoutRoute).toContain('requirePortfolioAccess');
    expect(payoutRoute).toContain('Number.isFinite(requestedYear)');
    expect(payoutRoute).not.toContain('createServerClient');
    expect(exportRoute).not.toContain('fair_market_value_assets * 0.05');
    expect(helper).toContain('minimumInvestmentReturn');
    expect(helper).toContain('actual_payout');
  });

  it('payout forecast treats missing payout history as missing data, not on track', () => {
    const route = src('app/api/portfolio/[id]/compliance/payout-forecast/route.ts');
    const component = src('components/compliance/PayoutTracker.tsx');

    expect(route).toContain('if (!payout)');
    expect(route).toContain('data_missing: true');
    expect(route).toContain('on_track: null');
    expect(route).toContain('pct_complete: null');
    expect(route).toContain('data_missing: false');
    expect(route).toContain('requirePortfolioAccess');
    expect(route).toContain('Number.isFinite(requestedYear)');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
    expect(component).toContain('Payout Setup Required');
    expect(component).toContain('boolean | null');
  });

  it('foundation 990-PF schema includes every payout formula input used by routes', () => {
    const migration = src('db/migrations/0013_tax_contributions.sql');
    const tableStart = migration.indexOf('CREATE TABLE IF NOT EXISTS public.foundation_990pf_data');
    expect(tableStart).toBeGreaterThan(-1);
    const tableBlock = migration.slice(tableStart, migration.indexOf(');', tableStart));

    for (const column of [
      'avg_fair_market_value',
      'fair_market_value_assets',
      'exempt_use_assets',
      'acquisition_indebtedness',
      'net_investment_income',
      'excise_tax_rate',
      'excise_tax_amount',
      'required_payout',
      'actual_payout',
    ]) {
      expect(tableBlock).toContain(column);
    }
  });

  it('does not create skeletal grants from operational widgets or workflow start', () => {
    for (const path of [
      'components/grants/PaymentSchedule.tsx',
      'components/grants/CommunicationLog.tsx',
      'app/api/org/[orgId]/workflows/route.ts',
    ]) {
      const source = src(path);
      expect(source, path).not.toMatch(/from\('grants'\)[\s\S]{0,120}\.insert\(/);
    }
  });
});
// Integration test.
