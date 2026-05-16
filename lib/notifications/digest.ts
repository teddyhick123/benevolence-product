// lib/notifications/digest.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { render } from '@react-email/components';
import { branding } from '@/lib/config';
import TaskDigestEmail from '@/lib/email/templates/task-digest';

const LOG = '[notifications:digest]';

type DigestTask = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  status: string;
  task_type: string;
};

type DigestSummary = {
  overdue: DigestTask[];
  dueSoon: DigestTask[];
  approvals: DigestTask[];
  automationFailures: DigestTask[];
  total: number;
};

async function buildDigestForUser(
  db: SupabaseClient,
  orgId: string,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<DigestSummary | null> {
  const today = periodEnd.slice(0, 10);
  const sevenDaysOut = new Date(new Date(periodEnd).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [overdueRes, dueSoonRes, approvalsRes, memberRes] = await Promise.all([
    db
      .from('tasks')
      .select('id, title, priority, due_at, status, task_type')
      .eq('org_id', orgId)
      .eq('assigned_to', userId)
      .eq('status', 'pending')
      .not('due_at', 'is', null)
      .lt('due_at', today),
    db
      .from('tasks')
      .select('id, title, priority, due_at, status, task_type')
      .eq('org_id', orgId)
      .eq('assigned_to', userId)
      .eq('status', 'pending')
      .not('due_at', 'is', null)
      .gte('due_at', today)
      .lte('due_at', sevenDaysOut),
    db
      .from('tasks')
      .select('id, title, priority, due_at, status, task_type')
      .eq('org_id', orgId)
      .eq('task_type', 'approval')
      .eq('status', 'pending')
      .or(`assigned_to.eq.${userId},assigned_to.is.null`),
    db
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single(),
  ]);

  const isAdmin = memberRes.data && ['owner', 'admin'].includes((memberRes.data as any).role);

  let automationFailures: DigestTask[] = [];
  if (isAdmin) {
    const { data: failedTasks } = await db
      .from('tasks')
      .select('id, title, priority, due_at, status, task_type')
      .eq('org_id', orgId)
      .eq('task_type', 'review')
      .eq('status', 'pending')
      .gte('created_at', periodStart);
    automationFailures = ((failedTasks ?? []) as DigestTask[]).filter(t =>
      t.title.toLowerCase().includes('automation') ||
      t.title.toLowerCase().includes('import') ||
      t.title.toLowerCase().includes('failure')
    );
  }

  const total = (overdueRes.data?.length ?? 0) + (dueSoonRes.data?.length ?? 0) + (approvalsRes.data?.length ?? 0) + automationFailures.length;
  if (total === 0) return null;

  return {
    overdue: (overdueRes.data ?? []) as DigestTask[],
    dueSoon: (dueSoonRes.data ?? []) as DigestTask[],
    approvals: (approvalsRes.data ?? []) as DigestTask[],
    automationFailures,
    total,
  };
}

export async function runDigestForOrg(
  db: SupabaseClient,
  orgId: string,
  periodStart: string,
  periodEnd: string,
  dryRun = false
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  const { data: members } = await db
    .from('organization_members')
    .select('user_id, notification_prefs')
    .eq('org_id', orgId);

  const { data: org } = await db.from('organizations').select('name').eq('id', orgId).single();
  const orgName = (org as any)?.name ?? 'Your Organization';
  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? 'resend.dev';

  for (const member of (members ?? []) as Array<{ user_id: string; notification_prefs: any }>) {
    const prefs = member.notification_prefs ?? {};
    if (prefs?.digest === 'never') { skipped++; continue; }
    if (prefs?.channels?.email === false) { skipped++; continue; }
    if (prefs?.alerts?.digest_summary === false) { skipped++; continue; }

    const summary = await buildDigestForUser(db, orgId, member.user_id, periodStart, periodEnd);
    if (!summary) { skipped++; continue; }

    if (dryRun) { sent++; continue; }

    const { data: authUser } = await (db as any).auth.admin.getUserById(member.user_id);
    const email = authUser?.user?.email;
    if (!email) { skipped++; continue; }

    const subject = `${summary.total} task${summary.total === 1 ? '' : 's'} need your attention`;
    const html = await render(
      TaskDigestEmail({
        appName: branding.appName,
        orgName,
        supportEmail: branding.supportEmail ?? `support@${fromDomain}`,
        subject,
        overdue: summary.overdue,
        dueSoon: summary.dueSoon,
        approvals: summary.approvals,
        automationFailures: summary.automationFailures,
        preferencesHref: `/settings/notifications`,
      })
    );

    try {
      const { error } = await resend.emails.send({
        from: `${branding.appName} <noreply@${fromDomain}>`,
        to: email,
        subject,
        html,
      });
      if (error) throw new Error(error.message);
      sent++;
      console.log(`${LOG} digest sent to ${email} for org ${orgId}`);
    } catch (err: any) {
      errors.push(`${member.user_id}: ${err.message}`);
    }
  }

  return { sent, skipped, errors };
}
