'use client';

import { apiRequest } from "@/lib/api/client";

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
  qbTokenExpired?: boolean;
  qbNeedsReconnect?: boolean;
  orgId: string;
}

export default function IntegrationsTab({ qbConnected, qbTokenExpired, qbNeedsReconnect, orgId }: IntegrationsTabProps) {
  async function handleQbDisconnect() {
    await apiRequest(`/api/integrations/quickbooks/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    });
    window.location.reload();
  }

  return (
    <div className="space-y-3 max-w-2xl">
      {qbConnected && (qbNeedsReconnect || qbTokenExpired) && (
        <div className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${qbNeedsReconnect ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div className="flex-1">
            <strong>{qbNeedsReconnect ? 'QuickBooks connection expired.' : 'QuickBooks access token expired.'}</strong>{' '}
            {qbNeedsReconnect
              ? 'Your refresh token has expired. Export buttons are disabled until you reconnect.'
              : 'Your access token needs renewal. Disconnect and reconnect to restore sync.'}
          </div>
          <a
            href={`/api/integrations/quickbooks/connect?org_id=${orgId}`}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded border ${qbNeedsReconnect ? 'border-red-300 hover:bg-red-100' : 'border-amber-300 hover:bg-amber-100'}`}
          >
            Reconnect
          </a>
        </div>
      )}
      <IntegrationCard
        name="QuickBooks"
        description="Sync chart of accounts and generate journal entries for your accounting team."
        connected={qbConnected}
        connectHref={`/api/integrations/quickbooks/connect?org_id=${orgId}`}
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
