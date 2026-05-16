// lib/notifications/types.ts

export const NOTIFICATION_EVENT_TYPES = [
  'task_assigned',
  'task_due_soon',
  'task_overdue',
  'task_priority_escalated',
  'approval_requested',
  'task_commented',
  'task_mentioned',
  'task_completed',
  'task_cancelled',
  'automation_failed',
  'digest_ready',
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

export const NOTIFICATION_ALERT_KEYS = [
  'assigned_to_me',
  'due_soon',
  'overdue',
  'approvals',
  'comments',
  'mentions',
  'automation_failures',
  'digest_summary',
  'org_admin',
] as const;

export type NotificationAlertKey = typeof NOTIFICATION_ALERT_KEYS[number];

export type NotificationChannel = 'in_app' | 'email' | 'digest';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'suppressed' | 'cancelled';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationPrefs = {
  digest: 'daily' | 'weekly' | 'never';
  quiet_hours?: {
    enabled: boolean;
    timezone: string;
    start: string;
    end: string;
  };
  channels: {
    in_app: boolean;
    email: boolean;
  };
  alerts: Record<NotificationAlertKey, boolean>;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  digest: 'weekly',
  channels: { in_app: true, email: true },
  alerts: {
    assigned_to_me: true,
    due_soon: true,
    overdue: true,
    approvals: true,
    comments: true,
    mentions: true,
    automation_failures: true,
    digest_summary: true,
    org_admin: false,
  },
};

// Payload stored in notification_events.payload — render-ready, no sensitive data
export type NotificationPayload = {
  title: string;
  body: string;
  href: string;
  task_title?: string;
  source_label?: string;
  reason: string;
  suppression_reason?: string;
};

export type FanOutTaskEventInput = {
  taskEventId: string;
  now?: string;
};

// Row shape returned from the DB for inbox rendering
export type InboxNotification = {
  id: string;
  event_type: NotificationEventType;
  priority: NotificationPriority;
  task_id: string | null;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
  channel: NotificationChannel;
  status: NotificationStatus;
};
