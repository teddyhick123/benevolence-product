'use client';

interface IntegrationCardProps {
  name: string;
  description: string;
  connected: boolean;
  connectHref?: string;
  onDisconnect?: () => void;
  comingSoon?: boolean;
}

function IntegrationCard({ name, description, connected, connectHref, onDisconnect, comingSoon }: IntegrationCardProps) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border border-black/10 p-4">
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-black/50 mt-0.5">{description}</p>
      </div>
      <div className="ml-4 shrink-0">
        {comingSoon ? (
          <span className="text-xs text-black/30 px-3 py-1.5 rounded border border-black/10">Coming soon</span>
        ) : connected ? (
          <button
            onClick={onDisconnect}
            className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50"
          >
            Disconnect
          </button>
        ) : (
          <a
            href={connectHref}
            className="text-xs text-azure px-3 py-1.5 rounded border border-azure/30 hover:bg-azure/5"
          >
            Connect
          </a>
        )}
      </div>
    </div>
  );
}

interface IntegrationsTabProps {
  qbConnected: boolean;
  orgId: string;
}

export default function IntegrationsTab({ qbConnected, orgId }: IntegrationsTabProps) {
  async function handleQbDisconnect() {
    await fetch(`/api/integrations/quickbooks/disconnect`, { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <IntegrationCard
        name="QuickBooks"
        description="Sync chart of accounts and generate journal entries for your accounting team."
        connected={qbConnected}
        connectHref={`/api/integrations/quickbooks/connect?orgId=${orgId}`}
        onDisconnect={handleQbDisconnect}
      />
      <IntegrationCard
        name="Salesforce"
        description="Sync donor and grant data with your Salesforce CRM."
        connected={false}
        comingSoon
      />
      <IntegrationCard
        name="Fidelity Charitable"
        description="Import DAF grant recommendations directly."
        connected={false}
        comingSoon
      />

      <div className="mt-6 p-4 rounded-lg border border-dashed border-black/15 text-center">
        <p className="text-sm text-black/50 mb-1">AI-powered instance customization</p>
        <p className="text-xs text-black/30">Build new modules tailored to your organization — coming soon.</p>
      </div>
    </div>
  );
}
