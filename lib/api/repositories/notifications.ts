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
    async updateOwnPreferences(patch: NotificationPreferences) {
      const { data: current, error: readError } = await db
        .from('organization_members')
        .select('notification_prefs')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
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
        .eq('user_id', userId);

      if (updateError) throw updateError;
      return merged;
    },
  };
}
