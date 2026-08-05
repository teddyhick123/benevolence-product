import { createElevatedClient } from '@/lib/api/admin-client';
import type { AppAdminAccessContext } from '@/lib/api/principals';

export type CharityWrite = Record<string, unknown> & { ein?: string };

/** Global charity catalog writes available only after app-admin authorization. */
export function createCharityAdminRepository(_scope: AppAdminAccessContext) {
  const db = createElevatedClient();

  return {
    async findByEin(ein: string | undefined) {
      const { data, error } = await db
        .from('charities')
        .select('id, ein, name')
        .eq('ein', ein)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async listNeedingEnrichment(limit: number) {
      const { data, error } = await db
        .from('charities')
        .select('id, ein, name')
        .is('charity_navigator_rating', null)
        .limit(Math.min(limit, 100));
      if (error) throw error;
      return data || [];
    },

    async update(id: string, updates: Record<string, unknown>) {
      const { error } = await db.from('charities').update(updates).eq('id', id);
      if (error) throw error;
    },

    async insert(charity: CharityWrite) {
      const { data, error } = await db
        .from('charities')
        .insert(charity)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  };
}
