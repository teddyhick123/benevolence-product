import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import {
  createAICredentialRepository,
  type AICredentialRepository,
} from '@/lib/api/repositories/ai-credentials';

type AIRoutingScope = {
  orgId: string;
  actorId?: string;
};

type AIRoutingDependencies = {
  db?: ElevatedClient;
  credentials?: Pick<AICredentialRepository, 'hasCredential'>;
};

/** Elevated runtime reads constrained to one proven organization. */
export function createAIRoutingRepository(
  scope: AIRoutingScope,
  dependencies: AIRoutingDependencies = {},
) {
  const db = dependencies.db ?? createElevatedClient();
  const credentials = dependencies.credentials ?? createAICredentialRepository(scope);

  return {
    async getWorkloadRoute(workloadId: string) {
      const { data: route, error: routeError } = await db
        .from('org_ai_routes')
        .select('*')
        .eq('org_id', scope.orgId)
        .eq('workload_id', workloadId)
        .maybeSingle();
      if (routeError) throw routeError;
      if (!route) return null;

      const { data: targets, error: targetsError } = await db
        .from('org_ai_route_targets')
        .select('*')
        .eq('org_id', scope.orgId)
        .eq('route_id', route.id)
        .order('position');
      if (targetsError) throw targetsError;
      const deploymentIds = (targets ?? []).flatMap(target =>
        target.deployment_id ? [target.deployment_id] : [],
      );
      const { data: deployments, error: deploymentsError } = deploymentIds.length === 0
        ? { data: [], error: null }
        : await db.from('org_ai_deployments')
          .select('*')
          .eq('org_id', scope.orgId)
          .in('id', deploymentIds);
      if (deploymentsError) throw deploymentsError;
      const connectionIds = [...new Set((deployments ?? []).map(row => row.connection_id))];
      const { data: connections, error: connectionsError } = connectionIds.length === 0
        ? { data: [], error: null }
        : await db.from('org_ai_connections')
          .select('*')
          .eq('org_id', scope.orgId)
          .in('id', connectionIds);
      if (connectionsError) throw connectionsError;
      const credentialAvailability = new Map<string, boolean>();
      await Promise.all(connectionIds.map(async connectionId => {
        credentialAvailability.set(connectionId, await credentials.hasCredential(connectionId));
      }));
      return {
        route,
        targets: targets ?? [],
        deployments: deployments ?? [],
        connections: connections ?? [],
        credentialAvailability,
      };
    },
  };
}
