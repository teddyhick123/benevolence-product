// lib/notifications/recipients.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { WORKSPACE_MANAGER_ROLES } from '@/lib/roles';

export type Recipient = {
  userId: string;
  role: string;
};

export async function getOrgAdminRecipients(
  db: SupabaseClient,
  orgId: string
): Promise<Recipient[]> {
  const { data } = await db
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId)
    .in('role', WORKSPACE_MANAGER_ROLES);
  return (data ?? []).map((m: any) => ({ userId: m.user_id, role: m.role }));
}

export type RecipientWithAlert = {
  userId: string;
  role: string;
  alertKey: string;
};

export async function resolveRecipients(
  db: SupabaseClient,
  orgId: string,
  task: {
    assigned_to: string | null;
    task_type: string;
    priority: string;
  },
  eventType: string,
  actorId: string | null,
  commentMentions?: string[]
): Promise<RecipientWithAlert[]> {
  const recipients: RecipientWithAlert[] = [];

  async function isMember(userId: string): Promise<boolean> {
    const { data } = await db
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();
    return !!data;
  }

  async function getMemberRole(userId: string): Promise<string> {
    const { data } = await db
      .from('organization_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single();
    return (data as any)?.role ?? 'member';
  }

  switch (eventType) {
    case 'task_assigned': {
      if (task.assigned_to && task.assigned_to !== actorId) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: 'assigned_to_me' });
        }
      }
      break;
    }

    case 'task_commented':
    case 'task_mentioned': {
      if (task.assigned_to && task.assigned_to !== actorId) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: eventType === 'task_mentioned' ? 'mentions' : 'comments' });
        }
      }
      for (const uid of (commentMentions ?? [])) {
        if (uid !== actorId && !recipients.find(r => r.userId === uid)) {
          if (await isMember(uid)) {
            recipients.push({ userId: uid, role: await getMemberRole(uid), alertKey: 'mentions' });
          }
        }
      }
      break;
    }

    case 'task_due_soon':
    case 'task_overdue': {
      const alertKey = eventType === 'task_due_soon' ? 'due_soon' : 'overdue';
      if (task.assigned_to) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey });
        }
      } else if (task.priority === 'urgent') {
        const admins = await getOrgAdminRecipients(db, orgId);
        admins.forEach(a => recipients.push({ ...a, alertKey }));
      }
      break;
    }

    case 'approval_requested': {
      if (task.assigned_to) {
        if (await isMember(task.assigned_to)) {
          recipients.push({ userId: task.assigned_to, role: await getMemberRole(task.assigned_to), alertKey: 'approvals' });
        }
      } else {
        const admins = await getOrgAdminRecipients(db, orgId);
        admins.forEach(a => recipients.push({ ...a, alertKey: 'approvals' }));
      }
      break;
    }

    case 'automation_failed': {
      const admins = await getOrgAdminRecipients(db, orgId);
      admins.forEach(a => recipients.push({ ...a, alertKey: 'automation_failures' }));
      break;
    }

    default:
      break;
  }

  return recipients;
}
