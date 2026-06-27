# Task Automation Producers — Spec Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align automation producers, task-writer, and source hooks with the finalized spec — single-key grant milestone escalation, corrected source keys/task types across all producers, spec-compliant escalation state names, donor entity links, soft assignment validation, and two missing source hooks.

**Architecture:** Contract-test-first across 8 focused tasks. Task 1 updates the contract test file to assert all new patterns (many tests fail); Tasks 2-8 fix one production file at a time until all tests pass. No schema changes or new migrations needed.

**Tech Stack:** TypeScript, Vitest, Next.js App Router route handlers, Supabase admin client.

---

### Task 1: Update contract tests — replace stale assertions and add new guards

**Files:**
- Modify: `lib/__tests__/task-automation-contract.test.ts`

- [ ] **Step 1: Add new file reads at the top of the test file**

Open `lib/__tests__/task-automation-contract.test.ts`. After the existing `const pledgeCancelRouteSrc = read(...)` line, add:

```typescript
const milestoneRouteSrc = read('app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts');
const importCommitRouteSrc = read('app/api/admin/imports/[id]/commit/route.ts');
```

- [ ] **Step 2: Replace stale source-key assertions in section 3**

Find the describe block `'Source key patterns'`. Replace every `it(...)` inside it with the following (these are the new spec-correct keys):

```typescript
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
```

- [ ] **Step 3: Replace the stale grant milestone prefix test in section 5 and add new route hook assertions**

Find describe `'Task writer prefix safety in producers'`. Replace only the `'grant producer uses prefix form for grant_milestone complete'` it-block with nothing (delete it). Then after the `'import producer uses prefix form for import_job cancel'` it-block, add three new assertions:

```typescript
  it('milestone route uses prefix form for completeGeneratedTasks on milestone complete', () => {
    expect(milestoneRouteSrc).toMatch(/completeGeneratedTasks[^`]*`grant_milestone:\${[^}]+}:`/);
  });

  it('milestone route uses prefix form for cancelGeneratedTasks on milestone cancel', () => {
    expect(milestoneRouteSrc).toMatch(/cancelGeneratedTasks[^`]*`grant_milestone:\${[^}]+}:`/);
  });

  it('import commit route completes import_job approval task on commit', () => {
    expect(importCommitRouteSrc).toMatch(/completeGeneratedTasks[^`]*`import_job:\${[^}]+}:approval`/);
  });
```

- [ ] **Step 4: Append three new describe blocks at the end of the file (before closing)**

```typescript
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
    expect(complianceSrc).toContain("'reminder_7'");
    expect(complianceSrc).toContain("'reminder_14'");
    expect(complianceSrc).toContain("'reminder_30'");
  });

  it('uses spec escalation states for filing overdue', () => {
    expect(complianceSrc).toContain("'overdue_1'");
    expect(complianceSrc).toContain("'overdue_7'");
    expect(complianceSrc).toContain("'overdue_30'");
  });

  it('uses spec escalation states for state registrations', () => {
    expect(complianceSrc).toContain("'renewal_60'");
    expect(complianceSrc).toContain("'renewal_30'");
    expect(complianceSrc).toContain("'renewal_14'");
    expect(complianceSrc).toContain("'renewal_7'");
  });
});

// ---------------------------------------------------------------------------
// 12. Assignment validation in task-writer
// ---------------------------------------------------------------------------
describe('Assignment validation', () => {
  it('task writer validates assignee against org membership', () => {
    expect(writerSrc).toContain('organization_members');
    expect(writerSrc).toContain('validateAssignee');
  });
});
```

- [ ] **Step 5: Run tests to confirm new/changed tests fail**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: many failures in sections 3, 5, 10, 11, 12 — the tests for old patterns now fail. Sections 1, 2, 4, 6, 7, 8, 9 should still pass.

- [ ] **Step 6: Commit failing tests as the contract**

```bash
git add lib/__tests__/task-automation-contract.test.ts
git commit -m "test: update automation contract for spec-aligned source keys and new guards"
```

---

### Task 2: Fix grants.ts — single-key milestone model and all source/type corrections

**Files:**
- Modify: `lib/tasks/automation/producers/grants.ts`

Changes in this task:
- Milestone: one task per milestone (`grant_milestone:{id}:due`), `task_type: 'review'`, unified priority/escalation logic, add holding + portfolio links, remove `completeGeneratedTasks` calls inside the producer
- Report: key `due_soon` → `due`, HIGH_PRIORITY_DAYS 14 → 15, add holding + portfolio links
- Payment: key `conditions_pending` → `conditions`, `task_type: 'checklist_step'` → `'approval'`, add status + scheduled_date filter, add 14-day window, add overdue detection (priority high → urgent), add holding link

- [ ] **Step 1: Update the file header comment and imports**

Replace the top-of-file comment block and the imports to:

```typescript
// lib/tasks/automation/producers/grants.ts
//
// Produces tasks for grant obligations:
//   1. grant_milestones — one task per milestone, updated in place as priority escalates
//   2. grant_reports    — reports due soon or overdue that haven't been submitted/received
//   3. grant_payments   — payments where conditions haven't been met yet
//
// CRITICAL: grant_milestones, grant_reports, and grant_payments have NO org_id column.
// Scope via: grant_milestones/grant_payments → grant_details → holdings.org_id
// Admin client bypasses RLS; filter org_id client-side from joined holdings.
//
// Source key formats:
//   Milestone (one key, updated in place): grant_milestone:{id}:due
//   Report (one key, updated in place):    grant_report:{id}:due
//   Payment conditions:                    grant_payment:{id}:conditions
//
// Prefix for closing all tasks for a milestone: grant_milestone:{id}:
// Prefix for closing all tasks for a report:    grant_report:{id}:
// Prefix for closing all tasks for a payment:   grant_payment:{id}:

import { createAdminClient } from '@/lib/supabase';
import { ProducerOptions, TaskProducerResult, UpsertGeneratedTaskInput } from '../types';
import { upsertGeneratedTask } from '../task-writer';
```

Note: `completeGeneratedTasks` is removed from the import — the producer no longer calls it. The milestone PATCH route now owns cancellation/completion of milestone tasks.

- [ ] **Step 2: Update producer constants**

Replace the constants block near the top of the function (after the import) with:

```typescript
const PRODUCER_ID = 'grant_obligations';

const MILESTONE_REMINDER_DAYS = 30;
const MILESTONE_HIGH_PRIORITY_DAYS = 14;

const REPORT_REMINDER_DAYS = 45;
const REPORT_HIGH_PRIORITY_DAYS = 15; // spec: 1-15 days = high

const PAYMENT_REMINDER_DAYS = 14; // spec: scheduled within 14 days or overdue

const MILESTONE_OPEN_STATUSES = ['pending', 'in_progress', 'overdue'];
```

- [ ] **Step 3: Replace the entire milestone for-loop body**

Find the `for (const milestone of orgMilestones)` loop. Replace its entire `try` block with:

```typescript
    try {
      const milestoneDesc = (milestone.description as string | null) ?? '';
      const dueDateMs = new Date(dueDate).getTime();
      const nowMs = now.getTime();
      const diffDays = (dueDateMs - nowMs) / (1000 * 60 * 60 * 24);
      const isOverdue = dueDate < today;
      const holdingId = ((milestone as any).grant_details?.holding_id as string | null) ?? null;

      let priority: UpsertGeneratedTaskInput['priority'];
      let escalationState: string;
      let taskTitle: string;
      let taskDescription: string;

      if (isOverdue) {
        const daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));
        priority = 'urgent';
        escalationState = daysOverdue >= 30 ? 'overdue_30' : daysOverdue >= 7 ? 'overdue_7' : 'overdue_1';
        taskTitle = `Overdue milestone — ${milestoneName}`;
        taskDescription =
          `Grant milestone "${milestoneName}" for ${grantName} was due on ${dueDate}` +
          ` and is now ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.` +
          (milestoneDesc ? ` Details: ${milestoneDesc}` : '') +
          ` Update the milestone status or complete it as soon as possible.`;
      } else {
        const daysUntilDue = Math.ceil(diffDays);
        priority = daysUntilDue <= MILESTONE_HIGH_PRIORITY_DAYS ? 'high' : 'normal';
        escalationState = daysUntilDue <= MILESTONE_HIGH_PRIORITY_DAYS ? 'approaching' : 'due_soon';
        taskTitle = `Grant milestone due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} — ${milestoneName}`;
        taskDescription =
          `Grant milestone "${milestoneName}" for ${grantName} is due on ${dueDate}` +
          ` (${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} away).` +
          (milestoneDesc ? ` Details: ${milestoneDesc}` : '') +
          ` Complete or update this milestone before the deadline.`;
      }

      const links: UpsertGeneratedTaskInput['links'] = [
        { entityType: 'grant_milestone', entityId: milestoneId, relationship: 'primary' },
        { entityType: 'grant', entityId: grantId, relationship: 'context' },
      ];
      if (holdingId) links.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
      if (portfolioId) links.push({ entityType: 'portfolio', entityId: portfolioId, relationship: 'context' });

      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_milestone:${milestoneId}:due`,
        title: taskTitle,
        description: taskDescription,
        taskType: 'review',
        priority,
        dueAt: dueDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: isOverdue ? 'overdue' : 'upcoming_milestone',
          source_status: status,
          escalation_state: escalationState,
          ...(isOverdue
            ? { days_overdue: Math.ceil((now.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)) }
            : { days_until_due: Math.ceil((new Date(dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) }),
          grant_id: grantId,
          generated_at: generatedAt,
        },
        links,
        reopenResolved: false,
      };

      if (!dryRun) {
        const upsertResult = await upsertGeneratedTask(db, task);
        if (upsertResult === 'created') result.created++;
        else if (upsertResult === 'updated') result.updated++;
        else result.skipped++;
      } else {
        result.skipped++;
      }
    } catch (err: any) {
      result.errors.push({
        sourceType: 'grant_milestones',
        sourceId: milestoneId,
        message: err?.message ?? String(err),
      });
    }
```

Also remove the now-unused local variables `dueDateMs`, `nowMs`, `diffMs`, `diffDays`, `isOverdue` that were declared BEFORE the try block in the original code — they are now inside the try block.

- [ ] **Step 4: Update grant report section**

In the grant report section, make three targeted changes:

1. Change `REPORT_HIGH_PRIORITY_DAYS` constant to 15 (done in Step 2 above).

2. Add `holdingId` extraction after `portfolioId`:
```typescript
    const portfolioId = (holding.portfolio_id as string | null) ?? null;
    const holdingId = ((report as any).grant_details?.holding_id as string | null) ?? null;
```

3. Change the `task` object's `sourceKey` and `links`:
```typescript
        sourceKey: `grant_report:${reportId}:due`,
        // ...
        links: (() => {
          const l: UpsertGeneratedTaskInput['links'] = [
            { entityType: 'grant_report', entityId: reportId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ];
          if (holdingId) l.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
          if (portfolioId) l.push({ entityType: 'portfolio', entityId: portfolioId, relationship: 'context' });
          return l;
        })(),
```

- [ ] **Step 5: Update grant payment section**

In the grant payment section make these changes:

1. Add payment horizon constant (after the `db` const, before the payment query):
```typescript
  const paymentHorizon = new Date(now);
  paymentHorizon.setDate(paymentHorizon.getDate() + PAYMENT_REMINDER_DAYS);
  const paymentHorizonStr = paymentHorizon.toISOString().slice(0, 10);
```

2. Update the payment query to add status filter, scheduled_date filter, and window:
```typescript
  const { data: payments, error: paymentsError } = await (db
    .from('grant_payments')
    .select(
      'id, grant_id, payment_number, amount, conditions_met, paid_date, scheduled_date, status, grant_details!inner(holding_id, holdings!inner(org_id, portfolio_id, name))'
    )
    .is('paid_date', null)
    .eq('conditions_met', false)
    .in('status', ['scheduled', 'approved', 'processing'])
    .not('scheduled_date', 'is', null)
    .lte('scheduled_date', paymentHorizonStr) as any);
```

3. In the payment for-loop, add `holdingId`, overdue detection, and priority:
```typescript
    const holdingId = ((payment as any).grant_details?.holding_id as string | null) ?? null;
    const isPaymentOverdue = scheduledDate !== null && scheduledDate < today;
    const paymentPriority: UpsertGeneratedTaskInput['priority'] = isPaymentOverdue ? 'urgent' : 'high';
```

4. Change the task object:
```typescript
      const task: UpsertGeneratedTaskInput = {
        orgId,
        portfolioId,
        sourceKey: `grant_payment:${paymentId}:conditions`,
        title: `Grant payment #${paymentNumber} awaiting conditions — ${grantName}`,
        description:
          `Payment #${paymentNumber}${amountStr} for ${grantName} cannot be disbursed because` +
          ` its conditions have not yet been marked as met.` +
          (scheduledDate ? ` This payment is scheduled for ${scheduledDate}.` : '') +
          ` Review and confirm all disbursement conditions, then update the payment record.`,
        taskType: 'approval',
        priority: paymentPriority,
        dueAt: scheduledDate,
        assignedTo: null,
        metadata: {
          producer: PRODUCER_ID,
          reason: 'payment_conditions_pending',
          source_status: status,
          escalation_state: isPaymentOverdue ? 'overdue' : 'pending',
          payment_number: paymentNumber,
          grant_id: grantId,
          generated_at: generatedAt,
        },
        links: (() => {
          const l: UpsertGeneratedTaskInput['links'] = [
            { entityType: 'grant_payment', entityId: paymentId, relationship: 'primary' },
            { entityType: 'grant', entityId: grantId, relationship: 'context' },
          ];
          if (holdingId) l.push({ entityType: 'holding', entityId: holdingId, relationship: 'context' });
          return l;
        })(),
        reopenResolved: false,
      };
```

- [ ] **Step 6: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: all grant-related source key tests now pass. The tests for compliance, imports, pledges, task-writer, milestone route, and import commit still fail.

- [ ] **Step 7: Commit**

```bash
git add lib/tasks/automation/producers/grants.ts
git commit -m "fix(automation): single-key milestone model, correct source keys/types/links in grant producer"
```

---

### Task 3: Fix compliance.ts — escalation state naming and extension_due_date

**Files:**
- Modify: `lib/tasks/automation/producers/compliance.ts`

- [ ] **Step 1: Add extension_due_date to the filing query**

Find the filing query `.select(...)`. Change it from:
```typescript
.select('id, org_id, title, filing_type, due_date, status, reminder_days, jurisdiction')
```
to:
```typescript
.select('id, org_id, title, filing_type, due_date, extension_due_date, status, reminder_days, jurisdiction')
```

- [ ] **Step 2: Add effective due date logic in the filing for-loop**

After `const jurisdiction = ...`, add:

```typescript
      // When the filing has been extended, use extension_due_date as the deadline
      const extensionDueDate = (filing.extension_due_date as string | null) ?? null;
      const effectiveDueDate: string =
        status === 'extended' && extensionDueDate ? extensionDueDate : dueDate;
```

Then replace every reference to `dueDate` in the filing loop's task creation with `effectiveDueDate`:
- The `isOverdue` check: `const isOverdue = effectiveDueDate < today;`
- `new Date(dueDate).getTime()` → `new Date(effectiveDueDate).getTime()`
- `task.dueAt = effectiveDueDate`
- Description mentions of the due date

- [ ] **Step 3: Replace the filing reminder escalation logic**

Find the `else if (diffDays <= maxReminderDays)` branch. Replace the entire priority/escalationState assignment block:

```typescript
          // From:
          if (activeThreshold <= (sortedThresholds[0] ?? 7)) {
            priority = 'urgent';
            escalationState = 'imminent';
          } else if (activeThreshold <= (sortedThresholds[1] ?? 14)) {
            priority = 'high';
            escalationState = 'approaching';
          } else {
            priority = 'normal';
            escalationState = 'upcoming';
          }

          // To (spec-compliant fixed thresholds):
          if (daysUntilDue <= 7) {
            priority = 'urgent';
            escalationState = 'reminder_7';
          } else if (daysUntilDue <= 14) {
            priority = 'high';
            escalationState = 'reminder_14';
          } else {
            priority = 'normal';
            escalationState = 'reminder_30';
          }
```

Also update the task's `dueAt` to use `effectiveDueDate`:
```typescript
            dueAt: effectiveDueDate,
```

- [ ] **Step 4: Replace the filing overdue escalation state**

In the filing overdue branch (`if (isOverdue)`), find `escalation_state: 'overdue'` in metadata and replace:

```typescript
          const daysOverdue = Math.ceil((nowMs - dueDateMs) / (1000 * 60 * 60 * 24));
          const overdueState = daysOverdue >= 30 ? 'overdue_30' : daysOverdue >= 7 ? 'overdue_7' : 'overdue_1';
          // ...
          metadata: {
            // ...
            escalation_state: overdueState,
            days_overdue: daysOverdue,
            // ...
          },
```

- [ ] **Step 5: Fix the state registration source key and escalation states**

In the state registration for-loop, make two changes:

1. Both `sourceKey` strings (overdue branch AND upcoming branch) change from `renewal_reminder` to `renewal`:
```typescript
            sourceKey: `state_registration:${regId}:renewal`,
```

2. Replace the escalation state logic for BOTH the overdue branch and upcoming branch:

Overdue branch — find `escalation_state: 'overdue'` and keep it (already correct for overdue).

Upcoming branch — replace:
```typescript
          if (daysUntilDue <= STATE_REG_URGENT_DAYS) {
            priority = 'urgent';
            escalationState = 'imminent';
          } else if (daysUntilDue <= STATE_REG_HIGH_PRIORITY_DAYS) {
            priority = 'high';
            escalationState = 'approaching';
          } else {
            priority = 'normal';
            escalationState = 'upcoming';
          }
```
with:
```typescript
          if (daysUntilDue <= 7) {
            priority = 'urgent';
            escalationState = 'renewal_7';
          } else if (daysUntilDue <= 14) {
            priority = 'high';
            escalationState = 'renewal_14';
          } else if (daysUntilDue <= 30) {
            priority = 'high';
            escalationState = 'renewal_30';
          } else {
            priority = 'normal';
            escalationState = 'renewal_60';
          }
```

- [ ] **Step 6: Update the file header comment to reflect new key**

At the top of compliance.ts, change:
```
//   State reg reminder:   state_registration:{id}:renewal_reminder
```
to:
```
//   State reg reminder/overdue: state_registration:{id}:renewal
```

- [ ] **Step 7: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: all compliance-related tests now pass.

- [ ] **Step 8: Commit**

```bash
git add lib/tasks/automation/producers/compliance.ts
git commit -m "fix(automation): spec-compliant escalation states, extension_due_date, and state_registration source key"
```

---

### Task 4: Fix imports.ts — rename source keys

**Files:**
- Modify: `lib/tasks/automation/producers/imports.ts`

- [ ] **Step 1: Change the file header comment**

At the top of imports.ts, change:
```
//   Error review:     import_job:{id}:errors
//   Approval needed:  import_job:{id}:needs_approval
```
to:
```
//   Error review:     import_job:{id}:review_errors
//   Approval needed:  import_job:{id}:approval
```

- [ ] **Step 2: Rename the error task source key**

Find:
```typescript
          sourceKey: `import_job:${jobId}:errors`,
```
Replace with:
```typescript
          sourceKey: `import_job:${jobId}:review_errors`,
```

- [ ] **Step 3: Rename the approval task source key**

Find:
```typescript
          sourceKey: `import_job:${jobId}:needs_approval`,
```
Replace with:
```typescript
          sourceKey: `import_job:${jobId}:approval`,
```

- [ ] **Step 4: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: import source key tests now pass.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/automation/producers/imports.ts
git commit -m "fix(automation): rename import source keys to spec-correct review_errors and approval"
```

---

### Task 5: Fix pledges.ts — add donor context entity link

**Files:**
- Modify: `lib/tasks/automation/producers/pledges.ts`

- [ ] **Step 1: Update the overdue task links**

In the overdue branch, find the `links` array inside the task object:
```typescript
          links: [
            { entityType: 'pledge_installment', entityId: instId, relationship: 'primary' },
            { entityType: 'pledge', entityId: pledgeId, relationship: 'context' },
          ],
```
Replace with:
```typescript
          links: [
            { entityType: 'pledge_installment', entityId: instId, relationship: 'primary' },
            { entityType: 'pledge', entityId: pledgeId, relationship: 'context' },
            { entityType: 'donor', entityId: pledge.donor_id, relationship: 'context' },
          ],
```

- [ ] **Step 2: Update the due-soon task links**

In the due-soon branch, make the same change — add the donor link at the end of the `links` array:
```typescript
          links: [
            { entityType: 'pledge_installment', entityId: instId, relationship: 'primary' },
            { entityType: 'pledge', entityId: pledgeId, relationship: 'context' },
            { entityType: 'donor', entityId: pledge.donor_id, relationship: 'context' },
          ],
```

- [ ] **Step 3: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: the `'pledge producer includes donor context link'` test now passes.

- [ ] **Step 4: Commit**

```bash
git add lib/tasks/automation/producers/pledges.ts
git commit -m "fix(automation): add donor context entity link to pledge installment tasks"
```

---

### Task 6: Add soft assignment validation to task-writer.ts

**Files:**
- Modify: `lib/tasks/automation/task-writer.ts`

The goal: if a producer sets `assignedTo` to a user ID, verify the user is an active `organization_members` row for the org. If not, log a warning and silently clear the assignment rather than throwing.

- [ ] **Step 1: Add the `validateAssignee` helper function**

After the imports at the top of `lib/tasks/automation/task-writer.ts`, add:

```typescript
async function validateAssignee(
  db: SupabaseClient,
  orgId: string,
  userId: string | null | undefined
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) {
    console.warn(
      `[task-writer] assignee ${userId} is not an org member of ${orgId} — clearing assignment`
    );
    return null;
  }
  return userId;
}
```

- [ ] **Step 2: Call `validateAssignee` at the start of `upsertGeneratedTask`**

Find the beginning of the `upsertGeneratedTask` function body (after `const now = new Date().toISOString()`). Add one line before the existing lookup query:

```typescript
  const resolvedAssignedTo = await validateAssignee(db, input.orgId, input.assignedTo);
```

- [ ] **Step 3: Replace `input.assignedTo` with `resolvedAssignedTo` in the insert and update paths**

In the `if (!existing)` insert block, change:
```typescript
        assigned_to: input.assignedTo ?? null,
```
to:
```typescript
        assigned_to: resolvedAssignedTo,
```

In the `patch` object comparison for `assigned_to`:
```typescript
  if ((existing.assigned_to ?? null) !== (input.assignedTo ?? null)) {
    events.push({ event_type: 'assigned', before_values: { assigned_to: existing.assigned_to }, after_values: { assigned_to: input.assignedTo ?? null } });
    patch.assigned_to = input.assignedTo ?? null;
  }
```
Change to:
```typescript
  if ((existing.assigned_to ?? null) !== resolvedAssignedTo) {
    events.push({ event_type: 'assigned', before_values: { assigned_to: existing.assigned_to }, after_values: { assigned_to: resolvedAssignedTo } });
    patch.assigned_to = resolvedAssignedTo;
  }
```

- [ ] **Step 4: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: the `'task writer validates assignee against org membership'` test now passes.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/automation/task-writer.ts
git commit -m "fix(automation): soft assignment validation — clear assignee if not an org member"
```

---

### Task 7: Add grant milestone PATCH source hook

**Files:**
- Modify: `app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts`

When a milestone's status changes to `completed` or `cancelled` via PATCH, close the corresponding automation task so the task inbox stays clean.

- [ ] **Step 1: Add imports at the top of the milestone route**

After the existing imports in `app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts`, add:

```typescript
import { createAdminClient } from '@/lib/supabase';
import { completeGeneratedTasks, cancelGeneratedTasks } from '@/lib/tasks/automation/task-writer';
```

- [ ] **Step 2: Add the source hook after the successful PATCH response**

Find the lines:
```typescript
    return NextResponse.json({ data: milestone });
  } catch (error: any) {
```

Insert the hook call BEFORE `return NextResponse.json({ data: milestone })`:

```typescript
    // Fire-and-forget: sync task state when milestone status changes
    const newStatus = validated.status as string | undefined;
    if (newStatus && ['completed', 'cancelled'].includes(newStatus)) {
      const grantDetails = existingMilestone.grant_details as any;
      const capturedMilestoneId = milestoneId;
      const capturedNewStatus = newStatus;
      (async () => {
        try {
          const adminDb = createAdminClient();
          const { data: holdingRow } = await adminDb
            .from('holdings')
            .select('org_id')
            .eq('id', grantDetails.holding_id)
            .single();
          const orgId = holdingRow?.org_id as string | undefined;
          if (!orgId) return;
          const prefix = `grant_milestone:${capturedMilestoneId}:`;
          if (capturedNewStatus === 'completed') {
            await completeGeneratedTasks(adminDb, orgId, prefix, 'Milestone marked as completed');
          } else {
            await cancelGeneratedTasks(adminDb, orgId, prefix, 'Milestone cancelled');
          }
        } catch (err) {
          console.warn('[task-hook] Failed to update grant milestone tasks:', err);
        }
      })();
    }

    return NextResponse.json({ data: milestone });
```

- [ ] **Step 3: Run contract tests**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: milestone route source hook tests now pass.

- [ ] **Step 4: Commit**

```bash
git add "app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts"
git commit -m "fix(automation): add grant milestone PATCH source hook — complete/cancel task on status change"
```

---

### Task 8: Add import commit source hook

**Files:**
- Modify: `app/api/admin/imports/[id]/commit/route.ts`

When an import job is committed and marked `completed`, complete the pending `import_job:{id}:approval` automation task.

- [ ] **Step 1: Add task-writer import**

At the top of `app/api/admin/imports/[id]/commit/route.ts`, add to the existing imports:

```typescript
import { completeGeneratedTasks } from '@/lib/tasks/automation/task-writer';
```

- [ ] **Step 2: Add the hook after the job is marked completed**

Find the block that updates the job to `completed`:
```typescript
  const { data: updated, error: updateError } = await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ...
    })
    ...
```

After the `if (updateError)` block (i.e., after the error check, before the fire-and-forget cleanup), add:

```typescript
  // Fire-and-forget: complete the approval task now that the import is committed
  const capturedJobId = id;
  const capturedOrgId = job.org_id as string | undefined;
  if (capturedOrgId) {
    completeGeneratedTasks(
      supabase,
      capturedOrgId,
      `import_job:${capturedJobId}:approval`,
      'Import job committed successfully'
    ).catch((err) => {
      console.warn('[task-hook] Failed to complete import approval task:', err);
    });
  }
```

- [ ] **Step 3: Run the full contract test suite**

```bash
npx vitest run lib/__tests__/task-automation-contract.test.ts --reporter=verbose 2>&1 | tail -60
```

Expected: ALL tests pass (0 failures).

- [ ] **Step 4: Also run the full test suite to confirm no regressions**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -80
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/imports/[id]/commit/route.ts"
git commit -m "fix(automation): add import commit source hook — complete approval task on commit"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| One task per grant milestone, updated in place | Task 2 |
| `grant_milestone:{id}:due` source key | Task 2 |
| `task_type = 'review'` for milestones | Task 2 |
| `grant_report:{id}:due` source key | Task 2 |
| `grant_payment:{id}:conditions` source key | Task 2 |
| `task_type = 'approval'` for grant payments | Task 2 |
| Grant payment 14-day window + status filter | Task 2 |
| Holding + portfolio links on milestones/reports | Task 2 |
| `filing:{id}:reminder` escalation states `reminder_7/14/30` | Task 3 |
| `filing:{id}:overdue` escalation states `overdue_1/7/30` | Task 3 |
| `state_registration:{id}:renewal` source key | Task 3 |
| State reg escalation states `renewal_60/30/14/7/overdue` | Task 3 |
| `extension_due_date` used when status = extended | Task 3 |
| `import_job:{id}:review_errors` source key | Task 4 |
| `import_job:{id}:approval` source key | Task 4 |
| `donor` context link on pledge tasks | Task 5 |
| Assignment validation against org membership | Task 6 |
| Grant milestone PATCH → complete/cancel task | Task 7 |
| Import commit → complete approval task | Task 8 |
| Contract tests guard all of the above | Task 1 |

**Placeholder scan:** None — every step contains exact code.

**Type consistency:** `TaskEntityType` values (`'holding'`, `'portfolio'`, `'donor'`) are used inline as string literals, which TypeScript will check against the const array in `types.ts`. `UpsertGeneratedTaskInput['links']` array type propagates the constraint. No mismatches.
