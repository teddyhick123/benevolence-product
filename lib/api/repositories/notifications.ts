import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

type NotificationPreferenceScope = Pick<OrgAccessContext, 'orgId' | 'principal'>;

export type NotificationPreferences = {
  digest?: 'daily' | 'weekly' | 'never';
  channels?: {
    in_app?: boolean;
    email?: boolean;
  };
  alerts?: Record<string, boolean>;
};

/** Elevated self-service preference writes constrained to one authorized member. */
export function createNotificationPreferenceRepository(
  scope: NotificationPreferenceScope
) {
  const db = createElevatedClient();
  const userId = scope.principal.userId;

  return {
    async getOwnPreferences(): Promise<NotificationPreferences | null> {
      const { data, error } = await db
        .from('organization_members')
        .select('notification_prefs')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data?.notification_prefs as NotificationPreferences | null) ?? null;
    },

    async updateOwnPreferences(patch: NotificationPreferences) {
      const { data: current, error: readError } = await db
        .from('organization_members')
        .select('notification_prefs')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (readError) throw readError;

      const merged = {
        ...(current?.notification_prefs || {}),
        ...patch,
      };
      const { error: updateError } = await db
        .from('organization_members')
        .update({ notification_prefs: merged })
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null);

      if (updateError) throw updateError;
      return merged;
    },
  };
}
