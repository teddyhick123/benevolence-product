import { executeGetGrantHealth } from '../tools/get-grant-health';
import { executeGetUpcomingDeadlines } from '../tools/get-upcoming-deadlines';
import { executeLogGrantCommunication } from '../tools/log-grant-communication';
import { executeRecordGrantPayment } from '../tools/record-grant-payment';
import { executeTrackMilestone } from '../tools/track-milestone';
import { executeStartDueDiligence } from '../tools/start-due-diligence';
import { executeGetWorkflowStatus } from '../tools/get-workflow-status';
import { executeCompleteWorkflowTask } from '../tools/complete-workflow-task';
import { executeScheduleReminder } from '../tools/schedule-reminder';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const GRANTS_EXECUTORS = {
  get_grant_health: executeGetGrantHealth,
  get_upcoming_deadlines: executeGetUpcomingDeadlines,
  log_grant_communication: executeLogGrantCommunication,
  record_grant_payment: executeRecordGrantPayment,
  track_milestone: executeTrackMilestone,
  start_due_diligence: executeStartDueDiligence,
  get_workflow_status: executeGetWorkflowStatus,
  complete_workflow_task: executeCompleteWorkflowTask,
  schedule_reminder: executeScheduleReminder,
} satisfies AssistantToolExecutorRegistry;
