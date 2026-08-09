'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useApiData } from '@/lib/api/client-hooks';
import { requestJson } from '@/lib/api/client';

type Connection = {
  id: string;
  name: string;
  connector: string;
  status: string;
  last_test_status: string | null;
  credential: { displayHint: string | null } | null;
};
type Deployment = {
  id: string;
  connection_id: string;
  name: string;
  status: string;
  catalog_template_id: string | null;
  verified_workloads: Record<string, unknown>;
};
type RouteTarget = {
  target_kind: 'deployment' | 'platform_default';
  deployment_id: string | null;
  position: number;
};
type WorkloadRoute = {
  workload_id: string;
  is_enabled: boolean;
  targets: RouteTarget[];
};
type Workload = { id: string; displayName: string };
type CatalogTemplate = { id: string; displayName: string; modelVendor: string };
type SettingsData = {
  connections: Connection[];
  deployments: Deployment[];
  routes: WorkloadRoute[];
  workloads: Workload[];
  catalog: CatalogTemplate[];
  usageSummary: {
    periodDays: number;
    invocations: number;
    failedInvocations: number;
    inputTokens: number;
    outputTokens: number;
    reportedCost: number;
  };
};

export default function AIModelsSettings({ orgId }: { orgId: string }) {
  const endpoint = `/api/org/${orgId}/ai-settings`;
  const { data, error, isLoading, mutate } = useApiData<SettingsData>(endpoint);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionName, setConnectionName] = useState('OpenRouter');
  const [apiKey, setApiKey] = useState('');
  const [deploymentConnection, setDeploymentConnection] = useState('');
  const [catalogTemplate, setCatalogTemplate] = useState('');
  const [rotationKeys, setRotationKeys] = useState<Record<string, string>>({});
  const [routeChoices, setRouteChoices] = useState<Record<string, string>>({});
  const [platformFallback, setPlatformFallback] = useState<Record<string, boolean>>({});

  const activeConnections = useMemo(
    () => data?.connections.filter(connection => connection.status === 'active') ?? [],
    [data],
  );

  async function perform(label: string, action: () => Promise<unknown>, success: string) {
    setBusy(label);
    setNotice(null);
    try {
      await action();
      await mutate();
      setNotice(success);
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : 'The change could not be saved.');
    } finally {
      setBusy(null);
    }
  }

  async function addConnection(event: FormEvent) {
    event.preventDefault();
    await perform('add-connection', () => requestJson(
      `/api/org/${orgId}/ai-settings/connections`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          connector: 'openrouter',
          name: connectionName,
          credential: { apiKey },
        }),
      },
    ), 'Connection added.');
    setApiKey('');
  }

  async function addDeployment(event: FormEvent) {
    event.preventDefault();
    await perform('add-deployment', () => requestJson(
      `/api/org/${orgId}/ai-settings/deployments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          connectionId: deploymentConnection,
          catalogTemplateId: catalogTemplate,
        }),
      },
    ), 'Model deployment added.');
  }

  async function saveRoute(workload: Workload) {
    const existing = data?.routes.find(route => route.workload_id === workload.id);
    const selected = routeChoices[workload.id]
      ?? existing?.targets.find(target => target.position === 0)?.deployment_id
      ?? (existing?.targets[0]?.target_kind === 'platform_default' ? 'platform_default' : '');
    if (!selected) {
      setNotice(`Choose a model for ${workload.displayName}.`);
      return;
    }
    const targets = selected === 'platform_default'
      ? [{ kind: 'platform_default' }]
      : [
        { kind: 'deployment', deploymentId: selected },
        ...(platformFallback[workload.id] ? [{ kind: 'platform_default' as const }] : []),
      ];
    await perform(`route-${workload.id}`, () => requestJson(
      `/api/org/${orgId}/ai-settings/routes`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workloadId: workload.id,
          policy: {
            experimentalUseAccepted: selected !== 'platform_default',
            mutationTools: 'verified_only',
          },
          targets,
        }),
      },
    ), `${workload.displayName} route saved.`);
  }

  if (isLoading) return <div className="card p-6 text-sm text-gray-500">Loading AI settings…</div>;
  if (error || !data) return <div className="card p-6 text-sm text-red-700">AI settings could not be loaded.</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-gray-900">AI models</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Connect your organization&apos;s OpenRouter account, add approved model deployments,
          and choose the model used for each workload. Credentials are write-only and never shown again.
        </p>
      </div>

      {notice && <div className="rounded-lg border border-azure/20 bg-white px-4 py-3 text-sm">{notice}</div>}

      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Invocations', data.usageSummary.invocations.toLocaleString()],
          ['Failed', data.usageSummary.failedInvocations.toLocaleString()],
          ['Tokens', (data.usageSummary.inputTokens + data.usageSummary.outputTokens).toLocaleString()],
          ['Reported cost', `$${data.usageSummary.reportedCost.toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">{label} · 30 days</div>
            <div className="mt-1 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Connections</h2>
          <p className="text-sm text-gray-500">Organization-funded provider accounts.</p>
        </div>
        <div className="space-y-3">
          {data.connections.map(connection => (
            <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <div className="font-medium">{connection.name}</div>
                <div className="text-xs text-gray-500">
                  {connection.connector} · {connection.status} · {connection.credential?.displayHint ?? 'No credential'}
                  {connection.last_test_status ? ` · last test ${connection.last_test_status}` : ''}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  className="w-36 rounded border px-2 py-1.5 text-sm"
                  type="password"
                  value={rotationKeys[connection.id] ?? ''}
                  onChange={event => setRotationKeys(current => ({ ...current, [connection.id]: event.target.value }))}
                  placeholder="New API key"
                  autoComplete="new-password"
                />
                <button
                  className="rounded border px-3 py-1.5 text-sm"
                  disabled={busy !== null || !(rotationKeys[connection.id]?.length >= 16)}
                  onClick={() => perform(`rotate-${connection.id}`, () => requestJson(
                    `/api/org/${orgId}/ai-settings/connections/${connection.id}/credential`,
                    {
                      method: 'PUT',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ apiKey: rotationKeys[connection.id] }),
                    },
                  ), 'Credential rotated.').then(() => setRotationKeys(current => ({ ...current, [connection.id]: '' })))}
                >Rotate</button>
                <button
                  className="rounded border px-3 py-1.5 text-sm"
                  disabled={busy !== null}
                  onClick={() => perform(`test-${connection.id}`, () => requestJson(
                    `/api/org/${orgId}/ai-settings/connections/${connection.id}/test`,
                    { method: 'POST' },
                  ), 'Connection test passed.')}
                >Test</button>
                <button
                  className="rounded border px-3 py-1.5 text-sm"
                  disabled={busy !== null}
                  onClick={() => perform(`disable-${connection.id}`, () => requestJson(
                    `/api/org/${orgId}/ai-settings/connections/${connection.id}`,
                    {
                      method: 'PATCH',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ status: connection.status === 'disabled' ? 'active' : 'disabled' }),
                    },
                  ), connection.status === 'disabled' ? 'Connection enabled.' : 'Connection disabled.')}
                >{connection.status === 'disabled' ? 'Enable' : 'Disable'}</button>
                <button
                  className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700"
                  disabled={busy !== null}
                  onClick={() => perform(`delete-${connection.id}`, () => requestJson(
                    `/api/org/${orgId}/ai-settings/connections/${connection.id}`,
                    { method: 'DELETE' },
                  ), 'Connection removed.')}
                >Remove</button>
              </div>
            </div>
          ))}
          {data.connections.length === 0 && <p className="text-sm text-gray-500">No organization connections yet.</p>}
        </div>
        <form className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={addConnection}>
          <input className="rounded border px-3 py-2 text-sm" value={connectionName} onChange={event => setConnectionName(event.target.value)} placeholder="Connection name" required />
          <input className="rounded border px-3 py-2 text-sm" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="OpenRouter API key" autoComplete="new-password" required />
          <button className="rounded bg-azure px-4 py-2 text-sm text-white" disabled={busy !== null}>Add connection</button>
        </form>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Model deployments</h2>
          <p className="text-sm text-gray-500">Curated model identities attached to one connection.</p>
        </div>
        <div className="space-y-3">
          {data.deployments.map(deployment => (
            <div key={deployment.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
              <div>
                <div className="font-medium">{deployment.name}</div>
                <div className="text-xs text-gray-500">{deployment.status} · {Object.keys(deployment.verified_workloads ?? {}).length} evaluated workloads</div>
              </div>
              <div className="flex gap-2">
                <button className="rounded border px-3 py-1.5 text-sm" disabled={busy !== null} onClick={() => perform(
                  `evaluate-${deployment.id}`,
                  () => requestJson(`/api/org/${orgId}/ai-settings/deployments/${deployment.id}/evaluate`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ workloadId: 'summaries' }),
                  }),
                  'Compatibility evaluation passed conditionally.',
                )}>Evaluate</button>
                <button className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" disabled={busy !== null} onClick={() => perform(
                  `delete-deployment-${deployment.id}`,
                  () => requestJson(`/api/org/${orgId}/ai-settings/deployments/${deployment.id}`, { method: 'DELETE' }),
                  'Model deployment removed.',
                )}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <form className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={addDeployment}>
          <select className="rounded border px-3 py-2 text-sm" value={deploymentConnection} onChange={event => setDeploymentConnection(event.target.value)} required>
            <option value="">Choose connection</option>
            {activeConnections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={catalogTemplate} onChange={event => setCatalogTemplate(event.target.value)} required>
            <option value="">Choose model</option>
            {data.catalog.map(template => <option key={template.id} value={template.id}>{template.displayName} · {template.modelVendor}</option>)}
          </select>
          <button className="rounded bg-azure px-4 py-2 text-sm text-white" disabled={busy !== null}>Add model</button>
        </form>
      </section>

      <section className="card space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">Workload routing</h2>
          <p className="text-sm text-gray-500">Platform funding is used only when explicitly selected here.</p>
        </div>
        <div className="divide-y">
          {data.workloads.map(workload => {
            const route = data.routes.find(item => item.workload_id === workload.id);
            const primary = route?.targets.find(target => target.position === 0);
            const value = routeChoices[workload.id]
              ?? primary?.deployment_id
              ?? (primary?.target_kind === 'platform_default' ? 'platform_default' : '');
            return (
              <div key={workload.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <div>
                  <div className="font-medium">{workload.displayName}</div>
                  <div className="text-xs text-gray-500">{route ? (route.is_enabled ? 'Configured' : 'Disabled') : 'Uses platform default'}</div>
                </div>
                <div className="space-y-2">
                  <select className="w-full rounded border px-3 py-2 text-sm" value={value} onChange={event => setRouteChoices(current => ({ ...current, [workload.id]: event.target.value }))}>
                    <option value="">Choose model</option>
                    <option value="platform_default">Platform default</option>
                    {data.deployments.filter(item => item.status === 'active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  {value && value !== 'platform_default' && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input type="checkbox" checked={platformFallback[workload.id] ?? false} onChange={event => setPlatformFallback(current => ({ ...current, [workload.id]: event.target.checked }))} />
                      Explicitly allow platform-funded fallback
                    </label>
                  )}
                </div>
                <button className="rounded border px-3 py-2 text-sm" disabled={busy !== null} onClick={() => saveRoute(workload)}>Save</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
