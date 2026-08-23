// Shared resolved-route fixture for the resolver suites. Not a test file —
// named so it stays outside vitest's *.test.* include glob.

export const RESOLVER_SCOPE = {
  kind: 'organization' as const,
  orgId: '00000000-0000-4000-8000-000000000001',
  actorId: '00000000-0000-4000-8000-000000000002',
  portfolioId: '00000000-0000-4000-8000-000000000003',
  turnId: '00000000-0000-4000-8000-000000000004',
};

export const CONNECTION_ID = '00000000-0000-4000-8000-000000000010';
export const DEPLOYMENT_ID = '00000000-0000-4000-8000-000000000011';

export function configuredRoute(overrides: Record<string, unknown> = {}) {
  return {
    route: {
      id: '00000000-0000-4000-8000-000000000012',
      is_enabled: true,
      policy: {
        experimentalUseAccepted: true,
        mutationTools: 'verified_only',
        fallbackOn: ['rate_limited', 'deployment_unavailable'],
      },
    },
    targets: [
      { position: 0, target_kind: 'deployment', deployment_id: DEPLOYMENT_ID },
      { position: 1, target_kind: 'platform_default', deployment_id: null },
    ],
    deployments: [{
      id: DEPLOYMENT_ID,
      connection_id: CONNECTION_ID,
      status: 'active',
      catalog_template_id: 'openrouter-anthropic-claude-sonnet',
      provider_model_id: 'anthropic/claude-sonnet-4.5',
      config: {},
      verified_workloads: {},
    }],
    connections: [{
      id: CONNECTION_ID,
      status: 'active',
      connector: 'openrouter',
      config: { provider: { zdr: true } },
    }],
    credentialAvailability: new Map([[CONNECTION_ID, true]]),
    ...overrides,
  };
}

/**
 * A route whose single deployment target names the given connector and
 * template, with no platform fallback so the assertion is unambiguous.
 */
export function connectorRoute(input: {
  connector: string;
  catalogTemplateId: string | null;
  providerModelId?: string;
  connectionConfig?: Record<string, unknown>;
}) {
  return configuredRoute({
    targets: [{ position: 0, target_kind: 'deployment', deployment_id: DEPLOYMENT_ID }],
    deployments: [{
      id: DEPLOYMENT_ID,
      connection_id: CONNECTION_ID,
      status: 'active',
      catalog_template_id: input.catalogTemplateId,
      provider_model_id: input.providerModelId ?? 'model',
      config: {},
      verified_workloads: {},
    }],
    connections: [{
      id: CONNECTION_ID,
      status: 'active',
      connector: input.connector,
      config: input.connectionConfig ?? {},
    }],
  });
}
