// lib/notifications/render.ts
import { NotificationEventType, NotificationPriority } from './types';

export type EmailRenderInput = {
  appName: string;
  orgName: string;
  supportEmail: string;
  notifType: NotificationEventType;
  priority: NotificationPriority;
  taskTitle: string;
  taskBody: string;
  taskHref: string;
  sourceLabel?: string;
  reason: string;
};

export function buildEmailSubject(input: EmailRenderInput): string {
  switch (input.notifType) {
    case 'task_assigned':           return `Task assigned: ${input.taskTitle}`;
    case 'task_due_soon':           return `Due soon: ${input.taskTitle}`;
    case 'task_overdue':            return `Overdue: ${input.taskTitle}`;
    case 'task_priority_escalated': return `Urgent now: ${input.taskTitle}`;
    case 'approval_requested':      return `Approval needed: ${input.taskTitle}`;
    case 'task_commented':          return `New comment: ${input.taskTitle}`;
    case 'task_mentioned':          return `You were mentioned: ${input.taskTitle}`;
    case 'automation_failed':       return `Automation failure: ${input.taskTitle}`;
    default:                        return input.taskTitle;
  }
}

export function buildEmailPreheader(input: EmailRenderInput): string {
  if (input.priority === 'urgent') return `Urgent — ${input.taskBody}`;
  if (input.priority === 'high') return `High priority — ${input.taskBody}`;
  return input.taskBody;
}
