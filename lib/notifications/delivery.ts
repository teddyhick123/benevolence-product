// lib/notifications/delivery.ts
import type { SupabaseClient } from '@/lib/database-client';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { branding } from '@/lib/config';
import TaskNotificationEmail from '@/lib/email/templates/task-notification';
import { buildEmailSubject, buildEmailPreheader, EmailRenderInput } from './render';
import { NotificationEventType, NotificationPriority } from './types';

const LOG = '[notifications:send]';

const RETRY_DELAYS_SECONDS = [
  5 * 60,       // 300s — 5 minutes
  30 * 60,      // 1800s — 30 minutes
  2 * 60 * 60,  // 7200s — 2 hours
];
const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type DeliverResult = 'sent' | 'suppressed' | 'failed';

export async function deliverEmailNotification(
  db: SupabaseClient,
  notificationId: string,
  dryRun = false
): Promise<DeliverResult> {
  const { data: notif, error: fetchError } = await db
    .from('notification_events')
    .select(`
      id,
      org_id,
      recipient_user_id,
      task_id,
      event_type,
      priority,
      payload,
      delivery_attempts,
      created_at,
      status,
      tasks (
        id,
        status,
        assigned_to
      )
    `)
    .eq('id', notificationId)
    .single();

  if (fetchError || !notif) {
    console.warn(`${LOG} notification ${notificationId} not found`);
    return 'failed';
  }

  const task = (notif as any).tasks as { id: string; status: string; assigned_to: string | null } | null;
  const payload = (notif as any).payload as any;
  const now = Date.now();
  const age = now - new Date((notif as any).created_at).getTime();

  const reasons: string[] = [];
  if (task && (task.status === 'completed' || task.status === 'cancelled')) {
    reasons.push(`task is ${task.status}`);
  }
  if (age > MAX_AGE_MS && (notif as any).priority !== 'urgent') {
    reasons.push('notification older than 14 days');
  }

  if (reasons.length > 0) {
    if (!dryRun) {
      await db
        .from('notification_events')
        .update({
          status: 'suppressed',
          error_message: `Suppressed: ${reasons.join('; ')}`,
          payload: { ...payload, suppression_reason: reasons.join('; ') },
        })
        .eq('id', notificationId);
    }
    console.log(`${LOG} suppressed ${notificationId}: ${reasons.join('; ')}`);
    return 'suppressed';
  }

  if (dryRun) return 'sent';

  const { data: authUser } = await (db as any).auth.admin.getUserById((notif as any).recipient_user_id);
  const recipientEmail = authUser?.user?.email;
  if (!recipientEmail) {
    await db.from('notification_events').update({ status: 'suppressed', error_message: 'No email address' }).eq('id', notificationId);
    return 'suppressed';
  }

  const { data: org } = await db.from('organizations').select('name').eq('id', (notif as any).org_id).single();
  const orgName = (org as any)?.name ?? 'Your Organization';

  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? 'resend.dev';
  const supportEmail = branding.supportEmail ?? `support@${fromDomain}`;

  const renderInput: EmailRenderInput = {
    appName: branding.appName,
    orgName,
    supportEmail,
    notifType: (notif as any).event_type as NotificationEventType,
    priority: (notif as any).priority as NotificationPriority,
    taskTitle: payload?.task_title ?? payload?.title ?? '',
    taskBody: payload?.body ?? '',
    taskHref: payload?.href ?? '/dashboard',
    sourceLabel: payload?.source_label,
    reason: payload?.reason ?? (notif as any).event_type,
  };

  const subject = buildEmailSubject(renderInput);
  const preheader = buildEmailPreheader(renderInput);

  const html = await render(
    TaskNotificationEmail({
      appName: branding.appName,
      orgName,
      supportEmail,
      subject,
      preheader,
      title: payload?.title ?? subject,
      body: payload?.body ?? '',
      taskHref: payload?.href ?? '/dashboard',
      ctaLabel: 'View Task',
      reason: payload?.reason ?? '',
      preferencesHref: `/settings/notifications`,
    })
  );

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const attempts = ((notif as any).delivery_attempts as number) + 1;

  try {
    const { error: sendError } = await resend.emails.send({
      from: `${branding.appName} <noreply@${fromDomain}>`,
      to: recipientEmail,
      subject,
      html,
    });

    if (sendError) throw new Error(sendError.message);

    await db.from('notification_events').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      delivery_attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: null,
    }).eq('id', notificationId);

    console.log(`${LOG} sent ${notificationId} to ${recipientEmail}`);
    return 'sent';
  } catch (err: any) {
    const delayIdx = Math.min(attempts - 1, RETRY_DELAYS_SECONDS.length - 1);
    const delaySec = RETRY_DELAYS_SECONDS[delayIdx] ?? RETRY_DELAYS_SECONDS[RETRY_DELAYS_SECONDS.length - 1];
    const nextAttempt = new Date(now + delaySec * 1000).toISOString();

    if (attempts >= MAX_ATTEMPTS) {
      await db.from('notification_events').update({
        status: 'suppressed',
        error_message: `Max attempts reached: ${err.message}`,
        delivery_attempts: attempts,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', notificationId);
      console.warn(`${LOG} max attempts reached for ${notificationId}`);
      return 'suppressed';
    }

    await db.from('notification_events').update({
      status: 'failed',
      error_message: err.message,
      delivery_attempts: attempts,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: nextAttempt,
    }).eq('id', notificationId);

    console.warn(`${LOG} failed ${notificationId} (attempt ${attempts}), retry at ${nextAttempt}`);
    return 'failed';
  }
}
