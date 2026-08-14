// lib/tasks/automation/run.ts
import { Producer, ProducerOptions, TaskProducerResult } from './types';
import { complianceDeadlinesProducer } from './producers/compliance';
import { pledgeFollowUpProducer } from './producers/pledges';
import { grantObligationsProducer } from './producers/grants';
import { importReviewProducer } from './producers/imports';
import { reportApprovalsProducer } from './producers/reports';
import { dateRelativeAutomationProducer } from './dynamic-rules';
import { taskAutomationOutboxProducer } from './outbox';
import { customFieldAutomationOutboxProducer } from './custom-field-outbox';

export const PRODUCERS: Producer[] = [
  { id: 'compliance_deadlines', run: complianceDeadlinesProducer },
  { id: 'pledge_follow_up',     run: pledgeFollowUpProducer },
  { id: 'grant_obligations',    run: grantObligationsProducer },
  { id: 'import_review',        run: importReviewProducer },
  { id: 'report_approvals',     run: reportApprovalsProducer },
  { id: 'dynamic_automation_rules', run: dateRelativeAutomationProducer },
  { id: 'task_automation_outbox', run: taskAutomationOutboxProducer },
  { id: 'custom_field_automation_outbox', run: customFieldAutomationOutboxProducer },
];

export const PRODUCER_IDS = PRODUCERS.map((p) => p.id);

export async function runProducers(
  options: ProducerOptions & { producerId?: string }
): Promise<TaskProducerResult[]> {
  const targets = options.producerId
    ? PRODUCERS.filter((p) => p.id === options.producerId)
    : PRODUCERS;

  const results: TaskProducerResult[] = [];

  for (const producer of targets) {
    try {
      const producerResults = await producer.run(options);
      results.push(...producerResults);
    } catch (err) {
      results.push({
        producer: producer.id,
        orgId: options.orgId,
        scanned: 0,
        created: 0,
        updated: 0,
        completed: 0,
        skipped: 0,
        errors: [{ sourceType: 'producer', sourceId: producer.id, message: String(err) }],
      });
    }
  }

  return results;
}
