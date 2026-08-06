// lib/notifications/preferences.ts
import {
  NotificationPrefs,
  NotificationAlertKey,
  DEFAULT_NOTIFICATION_PREFS,
} from './types';
import type { SupabaseClient } from '@/lib/database-client';

export function mergePrefsWithDefaults(raw: any): NotificationPrefs {
  return {
    digest: raw?.digest ?? DEFAULT_NOTIFICATION_PREFS.digest,
    channels: {
      in_app: raw?.channels?.in_app ?? DEFAULT_NOTIFICATION_PREFS.channels.in_app,
      email: raw?.channels?.email ?? DEFAULT_NOTIFICATION_PREFS.channels.email,
    },
    alerts: Object.fromEntries(
      (Object.keys(DEFAULT_NOTIFICATION_PREFS.alerts) as NotificationAlertKey[]).map(k => [
        k,
        raw?.alerts?.[k] ?? DEFAULT_NOTIFICATION_PREFS.alerts[k],
      ])
    ) as Record<NotificationAlertKey, boolean>,
  };
}

export async function loadMemberPrefs(
  db: SupabaseClient,
  orgId: string,
  userId: string
): Promise<NotificationPrefs> {
  const { data } = await db
    .from('organization_members')
    .select('notification_prefs')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single();
  return mergePrefsWithDefaults(data?.notification_prefs);
}

export function channelEnabled(
  prefs: NotificationPrefs,
  channel: 'in_app' | 'email'
): boolean {
  return prefs.channels[channel] ?? true;
}

export function alertEnabled(
  prefs: NotificationPrefs,
  alertKey: NotificationAlertKey
): boolean {
  return prefs.alerts[alertKey] ?? true;
}
