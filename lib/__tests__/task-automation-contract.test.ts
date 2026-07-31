// @vitest-environment node

// lib/__tests__/task-automation-contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd(); // project root when vitest runs

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function readMigrations(): string {
  const migDir = join(ROOT, 'db/migrations');
  return readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');
}

const migrations = readMigrations();
const typesSrc = read('lib/tasks/automation/types.ts');
const writerSrc = read('lib/tasks/automation/task-writer.ts');
const complianceSrc = read('lib/tasks/automation/producers/compliance.ts');
const pledgesSrc = read('lib/tasks/automation/producers/pledges.ts');
const grantsSrc = read('lib/tasks/automation/producers/grants.ts');
const importsSrc = read('lib/tasks/automation/producers/imports.ts');
const generateSrc = read('app/api/jobs/tasks/generate/route.ts');
const taskJobsRepositorySrc = read('lib/api/repositories/task-jobs.ts');
const filingCalendarRouteSrc = read('app/api/org/[orgId]/compliance/filing-calendar/route.ts');
const complianceRepositorySrc = read('lib/api/repositories/compliance.ts');
const installmentRouteSrc = read('app/api/org/[orgId]/pledges/[pledgeId]/installments/[installmentId]/route.ts');
const pledgeCancelRouteSrc = read('app/api/org/[orgId]/pledges/[pledgeId]/cancel/route.ts');
const pledgeRepositorySrc = read('lib/api/repositories/pledges.ts');
const milestoneRouteSrc = read('app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts');
const grantRepositorySrc = read('lib/api/repositories/grants.ts');
const importRepositorySrc = read('lib/api/repositories/imports.ts');

// ---------------------------------------------------------------------------
// 1. Active producer tables exist in migrations
// ---------------------------------------------------------------------------
describe('Active producer tables exist in migrations', () => {
  const ACTIVE_PRODUCER_TABLES = [
    'filing_calendar',
    'state_registrations',
    'pledge_installments',
    'pledges',
    'grant_milestones',
    'grant_reports',
    'grant_payments',
    'grants',
    'import_jobs',
    'task_automation_runs',
  ];

  for (const table of ACTIVE_PRODUCER_TABLES) {
    it(`table "${table}" is defined in migrations`, () => {
      // Check for CREATE TABLE or CREATE TABLE IF NOT EXISTS
      const pattern = new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?\\w*\\.?${table}\\s*\\(`, 'i');
      expect(pattern.test(migrations)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. TASK_ENTITY_TYPES covers all entity types used in producers
// ---------------------------------------------------------------------------
describe('TASK_ENTITY_TYPES covers all entity types used in producers', () => {
  const REQUIRED_ENTITY_TYPES = [
    'filing',
    'state_registration',
    'pledge_installment',
    'pledge',
    'grant_milestone',
    'grant_report',
    'grant_payment',
    'import_job',
  ];

  for (const entityType of REQUIRED_ENTITY_TYPES) {
    it(`TASK_ENTITY_TYPES includes '${entityType}'`, () => {
      expect(typesSrc).toContain(`'${entityType}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Source key patterns follow the required format
// ---------------------------------------------------------------------------
describe('Source key patterns', () => {
  it('pledge producer uses pledge_installment:{id}:due_soon pattern', () => {
    expect(pledgesSrc).toMatch(/`pledge_installment:\${.*}:due_soon`/);
  });

  it('pledge producer uses pledge_installment:{id}:overdue pattern', () => {
    expect(pledgesSrc).toMatch(/`pledge_installment:\${.*}:overdue`/);
  });

  it('compliance producer uses filing:{id}:reminder pattern', () => {
    expect(complianceSrc).toMatch(/`filing:\${.*}:reminder`/);
  });

  it('compliance producer uses filing:{id}:overdue pattern', () => {
    expect(complianceSrc).toMatch(/`filing:\${.*}:overdue`/);
  });

  it('compliance producer uses state_registration:{id}:renewal pattern', () => {
    expect(complianceSrc).toMatch(/`state_registration:\${.*}:renewal`/);
  });

  it('grant producer uses grant_milestone:{id}:due pattern', () => {
    expect(grantsSrc).toMatch(/`grant_milestone:\${.*}:due`/);
  });

  it('grant producer does not use stale grant_milestone:{id}:upcoming key', () => {
    expect(grantsSrc).not.toMatch(/`grant_milestone:\${.*}:upcoming`/);
  });

  it('grant producer does not use stale grant_milestone:{id}:overdue key', () => {
    expect(grantsSrc).not.toMatch(/`grant_milestone:\${.*}:overdue`/);
  });

  it('grant producer uses grant_report:{id}:due pattern', () => {
    expect(grantsSrc).toMatch(/`grant_report:\${.*}:due`/);
  });

  it('grant producer uses grant_payment:{id}:conditions pattern', () => {
    expect(grantsSrc).toMatch(/`grant_payment:\${.*}:conditions`/);
  });

  it('import producer uses import_job:{id}:review_errors pattern', () => {
    expect(importsSrc).toMatch(/`import_job:\${.*}:review_errors`/);
  });

  it('import producer uses import_job:{id}:approval pattern', () => {
    expect(importsSrc).toMatch(/`import_job:\${.*}:approval`/);
  });

  it('compliance producer uses extension_due_date for extended filings', () => {
    expect(complianceSrc).toContain('extension_due_date');
  });

  it('pledge producer includes donor context link', () => {
    expect(pledgesSrc).toContain("entityType: 'donor'");
  });
});

// ---------------------------------------------------------------------------
// 4. Grant producers do NOT use direct org_id filter on scoped tables
// ---------------------------------------------------------------------------
describe('Grant producer org scoping', () => {
  it('grant producer does not filter grant_milestones directly by org_id', () => {
    // Should NOT have .eq('org_id' immediately after .from('grant_milestones')
    // A direct org_id filter on this table would be wrong — must join via grants
    expect(grantsSrc).not.toMatch(/from\(['"]grant_milestones['"]\)[^)]*\.eq\(['"]org_id['"]/);
  });

  it('grant producer does not filter grant_payments directly by org_id', () => {
    expect(grantsSrc).not.toMatch(/from\(['"]grant_payments['"]\)[^)]*\.eq\(['"]org_id['"]/);
  });

  it('grant producer does not filter grant_reports directly by org_id', () => {
    expect(grantsSrc).not.toMatch(/from\(['"]grant_reports['"]\)[^)]*\.eq\(['"]org_id['"]/);
  });
});

// ---------------------------------------------------------------------------
// 5. Task writer prefix safety
//
// completeGeneratedTasks / cancelGeneratedTasks must use prefix form (trailing
// colon) when closing ALL tasks for a source record, OR must use an exact
// scoped source key (entity_type:{id}:event_name).
//
// Compliance and grants use the prefix form (filing:{id}:, grant_milestone:{id}:)
// to close all open tasks for a source when transitioning state.
//
// Pledges uses an exact key (pledge_installment:{id}:due_soon) to close only
// the due_soon task when an installment transitions to overdue — this is also
// correct and safe because the key is fully scoped.
//
// Imports uses the prefix form (import_job:{id}:) for terminal cancellation.
// ---------------------------------------------------------------------------
describe('Task writer prefix safety in producers', () => {
  it('pledge producer targets pledge_installment source key when completing tasks', () => {
    // Pledge producer completes the exact due_soon key (scoped to a single installment)
    // before creating an overdue task — this is safe because it has 2 colons minimum.
    expect(pledgesSrc).toMatch(/completeGeneratedTasks[^`]*`pledge_installment:\${[^}]+}:due_soon`/);
  });

  it('compliance producer completes only the filing reminder task when overdue', () => {
    expect(complianceSrc).toMatch(/completeGeneratedTasks[^`]*`filing:\${[^}]+}:reminder`/);
  });

  it('import producer uses prefix form for import_job cancel', () => {
    expect(importsSrc).toMatch(/cancelGeneratedTasks[^`]*`import_job:\${[^}]+}:`/);
  });

  it('milestone route uses prefix form for completeGeneratedTasks on milestone complete', () => {
    expect(milestoneRouteSrc).toContain('syncMilestoneTasks');
    expect(grantRepositorySrc).toMatch(/completeGeneratedTasks[\s\S]{0,180}sourcePrefix/);
    expect(grantRepositorySrc).toMatch(/`grant_milestone:\${input\.milestoneId}:`/);
  });

  it('milestone route uses prefix form for cancelGeneratedTasks on milestone cancel', () => {
    expect(grantRepositorySrc).toMatch(/cancelGeneratedTasks[\s\S]{0,180}sourcePrefix/);
  });

  it('import commit orchestration completes import_job approval task on commit', () => {
    expect(importRepositorySrc).toMatch(/completeGeneratedTasks[^`]*`import_job:\${[^}]+}:approval`/);
  });
});

// ---------------------------------------------------------------------------
// 6. Task writer prefix-safety guard exists
// ---------------------------------------------------------------------------
describe('Task writer prefix-safety guard', () => {
  it('task-writer asserts minimum 2 colons on prefix calls', () => {
    expect(writerSrc).toContain('assertPrefixSafe');
    expect(writerSrc).toMatch(/colonCount\s*<\s*2/);
  });

  it('task-writer assertPrefixSafe is called in both completeGeneratedTasks and cancelGeneratedTasks', () => {
    const assertCallCount = (writerSrc.match(/assertPrefixSafe\(/g) ?? []).length;
    // At least called in completeGeneratedTasks and cancelGeneratedTasks
    expect(assertCallCount).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Job route security
// ---------------------------------------------------------------------------
describe('Job route security', () => {
  it('generate route checks x-job-secret header', () => {
    expect(generateSrc).toContain("requireJobAccess(req, 'tasks')");
  });

  it('generate route validates producer against PRODUCER_IDS', () => {
    expect(generateSrc).toContain('PRODUCER_IDS');
  });

  it('generate route logs run to task_automation_runs', () => {
    expect(taskJobsRepositorySrc).toContain('task_automation_runs');
  });
});

// ---------------------------------------------------------------------------
// 8. Source hook cancel prefix safety in mutation routes
// ---------------------------------------------------------------------------
describe('Source hook cancel prefix safety', () => {
  it('filing-calendar task sync uses prefix form for cancelGeneratedTasks', () => {
    expect(filingCalendarRouteSrc).toContain('syncFilingStatusTasks');
    expect(complianceRepositorySrc).toMatch(/sourcePrefix\s*=\s*`filing:\${[^}]+}:`/);
    expect(complianceRepositorySrc).toMatch(/cancelGeneratedTasks\([\s\S]*sourcePrefix/);
  });

  it('installment route uses prefix form for completeGeneratedTasks on pay', () => {
    expect(installmentRouteSrc).toContain('syncInstallmentTasks');
    expect(pledgeRepositorySrc).toMatch(/completeGeneratedTasks[\s\S]*sourcePrefix/);
    expect(pledgeRepositorySrc).toMatch(/sourcePrefix\s*=\s*`pledge_installment:\${[^}]+}:`/);
  });

  it('installment route uses prefix form for cancelGeneratedTasks on waive/write_off', () => {
    expect(pledgeRepositorySrc).toMatch(/cancelGeneratedTasks[\s\S]*sourcePrefix/);
  });

  it('pledge cancel route uses prefix form for cancelGeneratedTasks', () => {
    const migration = read('db/migrations/0041_task_workflow_foundation.sql');

    expect(pledgeCancelRouteSrc).toContain('cancelPledge');
    expect(pledgeRepositorySrc).toContain("rpc('cancel_pledge_with_obligations'");
    expect(migration).toContain("t.source_key LIKE ('pledge_installment:' || pi.id || ':%')");
  });
});

// ---------------------------------------------------------------------------
// 9. Reports stub is safe (returns empty array, does not error)
// ---------------------------------------------------------------------------
describe('Reports producer stub', () => {
  it('reports producer exports reportApprovalsProducer', async () => {
    // Dynamic import — validates the module loads without errors
    const mod = await import('../tasks/automation/producers/reports');
    expect(typeof mod.reportApprovalsProducer).toBe('function');
  });

  it('reportApprovalsProducer returns an empty array', async () => {
    const mod = await import('../tasks/automation/producers/reports');
    const result = await mod.reportApprovalsProducer({});
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Task type conformance in producers
// ---------------------------------------------------------------------------
describe('Task type conformance', () => {
  it('grant producer uses task_type review for milestones', () => {
    expect(grantsSrc).toContain("taskType: 'review'");
  });

  it('grant producer uses task_type approval for payments', () => {
    expect(grantsSrc).toContain("taskType: 'approval'");
  });
});

// ---------------------------------------------------------------------------
// 11. Compliance escalation state naming conformance
// ---------------------------------------------------------------------------
describe('Compliance escalation state naming', () => {
  it('uses spec escalation states for filing reminders', () => {
    expect(complianceSrc).toMatch(/escalation_state:\s*'reminder_7'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'reminder_14'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'reminder_30'/);
  });

  it('uses spec escalation states for filing overdue', () => {
    expect(complianceSrc).toMatch(/escalation_state:\s*'overdue_1'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'overdue_7'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'overdue_30'/);
  });

  it('uses spec escalation states for state registrations', () => {
    expect(complianceSrc).toMatch(/escalation_state:\s*'renewal_60'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'renewal_30'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'renewal_14'/);
    expect(complianceSrc).toMatch(/escalation_state:\s*'renewal_7'/);
  });
});

// ---------------------------------------------------------------------------
// 12. Assignment validation in task-writer
// ---------------------------------------------------------------------------
describe('Assignment validation', () => {
  it('task writer validates assignee against org membership', () => {
    expect(writerSrc).toContain('organization_members');
    expect(writerSrc).toMatch(/await validateAssignee\(db,/);
  });
});

// ---------------------------------------------------------------------------
// 13. Import status enum completeness
// ---------------------------------------------------------------------------
describe('Import status enum includes all required values', () => {
  const REQUIRED_IMPORT_STATUSES = [
    'pending',
    'processing',
    'needs_review',
    'approved',
    'committing',
    'completed',
    'failed',
    'rejected',
    'rolled_back',
  ];

  for (const status of REQUIRED_IMPORT_STATUSES) {
    it(`import_status_enum includes '${status}'`, () => {
      expect(migrations).toContain(`'${status}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 14. No stale import status values in app code
// ---------------------------------------------------------------------------
describe('No stale import status values in app code', () => {
  const jobQueueSrc = read('lib/import/job-queue.ts');
  const rollbackSrc = read('lib/import/rollback.ts');
  const loadRouteSrc = (() => {
    try { return read('app/api/admin/imports/[id]/load/route.ts'); } catch { return ''; }
  })();

  it('job-queue does not use stale running status', () => {
    expect(jobQueueSrc).not.toContain("'running'");
  });

  it('job-queue does not use stale paused status', () => {
    expect(jobQueueSrc).not.toContain("'paused'");
  });

  it('job-queue does not reference pause_reason column', () => {
    expect(jobQueueSrc).not.toContain('pause_reason');
  });

  it('load route is deleted (stale duplicate of commit route)', () => {
    expect(loadRouteSrc).toBe('');
  });

  it('rollback does not reference stale paused status', () => {
    expect(rollbackSrc).not.toContain("'paused'");
  });

  it('rollback does not reference pause_reason', () => {
    expect(rollbackSrc).not.toContain('pause_reason');
  });
});

// ---------------------------------------------------------------------------
// 15. Import producer uses canonical column names
// ---------------------------------------------------------------------------
describe('Import producer uses canonical column names', () => {
  it('import producer queries name not entity_type', () => {
    expect(importsSrc).not.toContain('entity_type');
    expect(importsSrc).toContain('job.name');
  });

  it('import producer cancels tasks for rolled_back jobs', () => {
    expect(importsSrc).toContain("'rolled_back'");
  });
});

// ---------------------------------------------------------------------------
// 16. Per-entity staging tables exist in active migrations
// ---------------------------------------------------------------------------
describe('Per-entity staging tables exist in active migrations', () => {
  const REQUIRED_STAGING_TABLES = [
    'staging_import_donors',
    'staging_import_investees',
    'staging_import_holdings',
    'staging_import_contributions',
    'staging_import_metrics',
  ];

  for (const table of REQUIRED_STAGING_TABLES) {
    it(`staging table "${table}" is defined in migrations`, () => {
      const pattern = new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?\\w*\\.?${table}\\s*\\(`, 'i');
      expect(pattern.test(migrations)).toBe(true);
    });
  }

  it('staging_import_users is NOT in active migrations (users import deferred)', () => {
    const pattern = /CREATE TABLE\s+(IF NOT EXISTS\s+)?\w*\.?staging_import_users\s*\(/i;
    expect(pattern.test(migrations)).toBe(false);
  });

  it('import_jobs has last_heartbeat_at column', () => {
    expect(migrations).toContain('last_heartbeat_at');
  });

  it('import_mapping_profiles has entity_mappings column', () => {
    expect(migrations).toContain('entity_mappings');
  });
});
