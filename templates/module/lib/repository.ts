import { createElevatedClient } from '@/lib/api/admin-client';

type Scope = { orgId: string; actorId: string };

/** Elevated operations whose tenant scope is captured after authorization. */
export function create{ModuleName}Repository(scope: Scope) {
  const db = createElevatedClient();

  return {
    async list(filter: { status: string | null }) {
      let query = db
        .from('{module_name}_items')
        .select('*')
        .eq('org_id', scope.orgId)
        .order('created_at', { ascending: false });
      if (filter.status) query = query.eq('status', filter.status);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async create(input: { name: string }) {
      const { data, error } = await db
        .from('{module_name}_items')
        .insert({ org_id: scope.orgId, name: input.name, created_by: scope.actorId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async update(id: string, input: Record<string, unknown>) {
      const { data, error } = await db
        .from('{module_name}_items')
        .update({ ...input, updated_by: scope.actorId })
        .eq('org_id', scope.orgId)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async remove(id: string) {
      const { data, error } = await db
        .from('{module_name}_items')
        .delete()
        .eq('org_id', scope.orgId)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  };
}
