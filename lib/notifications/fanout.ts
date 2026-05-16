// lib/notifications/fanout.ts
import { SupabaseClient } from '@supabase/supabase-js';
import {
  FanOutTaskEventInput,
  NotificationEventType,
  NOTIFICATION_EVENT_TYPES,
  NotificationChannel,
  NotificationPriority,
} from './types';
import { loadMemberPrefs, channelEnabled, alertEnabled } from './preferences';
import { resolveRecipients, RecipientWithAlert } from './recipients';

const LOG = '[notifications:fanout]';

type FanOutResult = {
  taskEventId: string;
  created: number;
  suppressed: number;
  error?: string;
};

function classifyEvent(
  taskEventType: string,
  taskType: string,
  metadata: Record<string, any>
): NotificationEventType | null {
  switch (taskEventType) {
    case 'created':
      return taskType === 'approval' ? 'approval_requested' : null;
    case 'assigned':
      return 'task_assigned';
    case 'commented':
      return (metadata?.mentions?.length ?? 0) > 0 ? 'task_mentioned' : 'task_commented';
    case 'status_changed': {
      const newStatus = metadata?.to ?? '';
      if (newStatus === 'completed') return 'task_completed';
      if (newStatus === 'cancelled') return 'task_cancelled';
      return null;
    }
    case 'due_date_changed':
      return 'task_due_soon';
    default:
      return null;
  }
}

function immediateEmailEventTypes(): Set<NotificationEventType> {
  return new Set<NotificationEventType>([
    'task_assigned',
    'task_overdue',
    'task_priority_escalated',
    'approval_requested',
    'task_commented',
    'task_mentioned',
    'automation_failed',
  ]);
}

function buildDedupeKey(
  taskId: string,
  taskEventId: string,
  notifType: NotificationEventType,
  now?: string
): string {
  if (notifType === 'task_due_soon') {
    const date = now ? now.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `task:${taskId}:due_soon:${date}`;
  }
  if (notifType === 'task_overdue') {
    const date = now ? now.slice(0, 10) : new Date().toISOString().slice(0, 10);
    return `task:${taskId}:overdue:${date}`;
  }
  return `task:${taskId}:event:${taskEventId}:type:${notifType}`;
}

function taskPriorityToNotifPriority(taskPriority: string): NotificationPriority {
  if (taskPriority === 'urgent') return 'urgent';
  if (taskPriority === 'high') return 'high';
  if (taskPriority === 'low') return 'low';
  return 'normal';
}

function buildTitle(notifType: NotificationEventType, taskTitle: string): string {
  switch (notifType) {
    case 'task_assigned':           return `Task assigned: ${taskTitle}`;
    case 'task_due_soon':           return `Due soon: ${taskTitle}`;
    case 'task_overdue':            return `Overdue: ${taskTitle}`;
    case 'task_priority_escalated': return `Priority escalated: ${taskTitle}`;
    case 'approval_requested':      return `Approval needed: ${taskTitle}`;
    case 'task_commented':          return `New comment: ${taskTitle}`;
    case 'task_mentioned':          return `You were mentioned: ${taskTitle}`;
    case 'task_completed':          return `Completed: ${taskTitle}`;
    case 'task_cancelled':          return `Cancelled: ${taskTitle}`;
    case 'automation_failed':       return `Automation failure: ${taskTitle}`;
    default:                        return taskTitle;
  }
}

function buildBody(
  notifType: NotificationEventType,
  dueAt: string | null
): string {
  const duePart = dueAt ? ` Due: ${new Date(dueAt).toLocaleDateString()}.` : '';
  switch (notifType) {
    case 'task_assigned':      return `A task has been assigned to you.${duePart}`;
    case 'task_due_soon':      return `This task is due soon.${duePart}`;
    case 'task_overdue':       return `This task is past its due date.${duePart}`;
    case 'approval_requested': return `Your approval is needed.${duePart}`;
    case 'task_commented':     return 'Someone left a comment on your task.';
    case 'task_mentioned':     return 'You were mentioned in a task comment.';
    case 'automation_failed':  return 'An automation run failed and requires attention.';
    default:                   return '';
  }
}

export async function fanOutTaskEvent(
  db: SupabaseClient,
  input: FanOutTaskEventInput
): Promise<FanOutResult> {
  const { taskEventId, now } = input;
  const result: FanOutResult = { taskEventId, created: 0, suppressed: 0 };

  try {
    const { data: event, error: eventError } = await db
      .from('task_events')
      .select(`
        id,
        task_id,
        event_type,
        actor_id,
        metadata,
        created_at,
        tasks!inner (
          id,
          org_id,
          assigned_to,
          task_type,
          priority,
          title,
          status,
          due_at,
          source_key,
          description
        )
      `)
      .eq('id', taskEventId)
      .single();

    if (eventError || !event) {
      result.error = eventError?.message ?? 'task_event not found';
      return result;
    }

    const task = (event as any).tasks as {
      id: string;
      org_id: string;
      assigned_to: string | null;
      task_type: string;
      priority: string;
      title: string;
      status: string;
      due_at: string | null;
      source_key: string;
      description: string;
    };

    const orgId = task.org_id;

    if (task.status === 'completed' || task.status === 'cancelled') {
      result.suppressed++;
      console.log(`${LOG} suppressed taskEventId=${taskEventId} — task already ${task.status}`);
      return result;
    }

    const eventMeta = (event as any).metadata ?? {};
    const notifType = classifyEvent(event.event_type, task.task_type, eventMeta);
    if (!notifType) {
      result.suppressed++;
      return result;
    }

    const mentions: string[] = eventMeta?.mentions ?? [];
    const recipients: RecipientWithAlert[] = await resolveRecipients(
      db,
      orgId,
      {
        assigned_to: task.assigned_to,
        task_type: task.task_type,
        priority: task.priority,
      },
      notifType,
      (event as any).actor_id ?? null,
      mentions
    );

    if (recipients.length === 0) {
      result.suppressed++;
      return result;
    }

    const baseDedupeKey = buildDedupeKey(task.id, taskEventId, notifType, now);
    const isImmediate = immediateEmailEventTypes().has(notifType);
    const notifPriority = taskPriorityToNotifPriority(task.priority);

    const href = `/dashboard/tasks?task=${task.id}`;
    const payloadTitle = buildTitle(notifType, task.title);
    const payloadBody = buildBody(notifType, task.due_at);

    for (const recipient of recipients) {
      const prefs = await loadMemberPrefs(db, orgId, recipient.userId);

      const alertKey = recipient.alertKey as any;
      if (!alertEnabled(prefs, alertKey)) {
        result.suppressed++;
        continue;
      }

      const channels: NotificationChannel[] = [];
      if (channelEnabled(prefs, 'in_app')) channels.push('in_app');
      if (isImmediate && channelEnabled(prefs, 'email')) channels.push('email');

      for (const channel of channels) {
        const channelDedupe = `${baseDedupeKey}:${channel}:${recipient.userId}`;
        const { error: insertError } = await db
          .from('notification_events')
          .upsert(
            {
              org_id: orgId,
              recipient_user_id: recipient.userId,
              task_id: task.id,
              task_event_id: taskEventId,
              actor_id: (event as any).actor_id ?? null,
              event_type: notifType,
              channel,
              status: 'pending',
              priority: notifPriority,
              dedupe_key: channelDedupe,
              scheduled_for: new Date().toISOString(),
              payload: {
                title: payloadTitle,
                body: payloadBody,
                href,
                task_title: task.title,
                reason: notifType.replace(/_/g, ' '),
              },
            },
            { onConflict: 'org_id,recipient_user_id,channel,dedupe_key', ignoreDuplicates: true }
          );

        if (insertError) {
          console.warn(`${LOG} upsert error taskEventId=${taskEventId} channel=${channel}:`, insertError.message);
          result.suppressed++;
        } else {
          result.created++;
        }
      }
    }
  } catch (err: any) {
    result.error = err?.message ?? String(err);
    console.error(`${LOG} error for taskEventId=${taskEventId}:`, err);
  }

  return result;
}
