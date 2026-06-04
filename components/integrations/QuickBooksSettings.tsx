'use client';

// components/integrations/QuickBooksSettings.tsx
// QuickBooks Online connection management panel.

import { useEffect, useState, useCallback } from 'react';

interface QBStatus {
  connected: boolean;
  realm_id?: string;
  connected_at?: string;
  last_sync_at?: string | null;
  token_expiry?: string;
  token_expired?: boolean;
}

interface QBAccount {
  id: string;
  qb_id: string;
  qb_name: string;
  qb_type: string;
}

interface SyncLogEntry {
  id: string;
  event_type: string;
  status: string;
  record_count: number | null;
  error_msg: string | null;
  created_at: string;
}

interface Props {
  orgId: string;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function QuickBooksSettings({ orgId }: Props) {
  const [status, setStatus] = useState<QBStatus | null>(null);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Contribution export form state
  const [exportYear, setExportYear] = useState(currentYear);
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  const fetchStatus = useCallback(async (): Promise<QBStatus | null> => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/quickbooks/status?org_id=${orgId}`
      );
      const data = (await res.json()) as QBStatus;
      setStatus(data);
      return data;
    } catch {
      setStatus({ connected: false });
      return null;
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const fetchSyncLog = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/quickbooks/sync-log?org_id=${orgId}&limit=10`);
      if (res.ok) {
        const d = await res.json() as { log: SyncLogEntry[] };
        setSyncLog(d.log ?? []);
      }
    } catch { /* non-critical */ }
  }, [orgId]);

  useEffect(() => {
    void fetchStatus().then((s) => {
      if (s?.connected) {
        void loadAccounts();
        void fetchSyncLog();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select expense / bank accounts when account list changes
  useEffect(() => {
    if (accounts.length === 0) return;
    const expenseAcct = accounts.find(
      (a) =>
        a.qb_type === 'Expense' &&
        a.qb_name.toLowerCase().includes('charit')
    );
    const bankAcct = accounts.find((a) => a.qb_type === 'Bank');
    if (expenseAcct && !expenseAccountId) setExpenseAccountId(expenseAcct.qb_id);
    if (bankAcct && !bankAccountId) setBankAccountId(bankAcct.qb_id);
  }, [accounts, expenseAccountId, bankAccountId]);

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  }

  async function handleConnect() {
    window.location.href = `/api/integrations/quickbooks/connect?org_id=${orgId}`;
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect from QuickBooks? This will remove all synced account data.')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/integrations/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (res.ok) {
        showMsg('success', 'Disconnected from QuickBooks.');
        setAccounts([]);
        await fetchStatus();
      } else {
        const d = (await res.json()) as { error?: string };
        showMsg('error', d.error ?? 'Disconnect failed.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSyncAccounts() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/integrations/quickbooks/sync/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      });
      const d = (await res.json()) as { ok?: boolean; synced?: number; error?: string };
      if (d.ok) {
        showMsg('success', `Synced ${d.synced ?? 0} accounts.`);
        await fetchStatus();
        // Refresh account list for dropdowns
        await loadAccounts();
        await fetchSyncLog();
      } else {
        showMsg('error', d.error ?? 'Sync failed.');
        await fetchSyncLog();
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const res = await fetch(
        `/api/integrations/quickbooks/accounts?org_id=${orgId}`
      );
      if (res.ok) {
        const d = (await res.json()) as { accounts?: QBAccount[] };
        setAccounts(d.accounts ?? []);
      }
    } catch {
      // non-critical
    }
  }

  async function handleExportContributions() {
    if (!expenseAccountId || !bankAccountId) {
      showMsg('error', 'Please select expense and bank accounts before exporting.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/integrations/quickbooks/export/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          tax_year: exportYear,
          expense_account_id: expenseAccountId,
          bank_account_id: bankAccountId,
        }),
      });
      const d = (await res.json()) as {
        ok?: boolean;
        exported?: number;
        failed?: number;
        message?: string;
        error?: string;
      };
      if (d.ok) {
        const msg =
          d.message ??
          `Exported ${d.exported ?? 0} contributions${d.failed ? ` (${d.failed} failed)` : ''}.`;
        showMsg(d.failed ? 'error' : 'success', msg);
      } else {
        showMsg('error', d.error ?? 'Export failed.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExportGrants() {
    if (!expenseAccountId || !bankAccountId) {
      showMsg('error', 'Please select expense and bank accounts before exporting.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch('/api/integrations/quickbooks/export/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          expense_account_id: expenseAccountId,
          bank_account_id: bankAccountId,
        }),
      });
      const d = (await res.json()) as {
        ok?: boolean;
        exported?: number;
        failed?: number;
        message?: string;
        error?: string;
      };
      if (d.ok) {
        const msg =
          d.message ??
          `Exported ${d.exported ?? 0} grants${d.failed ? ` (${d.failed} failed)` : ''}.`;
        showMsg(d.failed ? 'error' : 'success', msg);
      } else {
        showMsg('error', d.error ?? 'Export failed.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
        <div className="h-4 w-48 rounded bg-neutral-200" />
        <div className="mt-3 h-3 w-32 rounded bg-neutral-100" />
      </div>
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <div className="rounded-2xl border border-black/5 bg-white shadow-soft">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 px-6 py-4">
        <div className="flex items-center gap-3">
          {/* QuickBooks logo mark */}
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2CA01C] text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14.5v-2.25H9A2.75 2.75 0 019 8.25h2V6l4 4-4 4v-1.5zm2-4h2a.75.75 0 000-1.5h-2v1.5zm0 2.5v-1h2A2.75 2.75 0 0015 8.75h-2V7l-4 4 4 4v-1.5h-1.5z" />
            </svg>
          </div>
          <div>
            <h2 className="font-serif text-lg font-medium text-ink">QuickBooks Online</h2>
            <p className="text-xs text-neutral-500">
              Sync accounts and export transactions to QBO
            </p>
          </div>
        </div>

        {/* Connection badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isConnected
              ? 'bg-green-50 text-green-700'
              : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-neutral-400'
            }`}
          />
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {/* Body */}
      <div className="space-y-5 px-6 py-5">
        {/* Inline message */}
        {message && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {!isConnected ? (
          /* ---- Not connected state ---- */
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-neutral-600">
              Connect your QuickBooks Online account to export charitable contributions and
              grants as journal entries.
            </p>
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90 disabled:opacity-50"
            >
              Connect to QuickBooks
            </button>
          </div>
        ) : (
          /* ---- Connected state ---- */
          <div className="space-y-5">
            {/* Token-expired warning */}
            {status?.token_expired && (
              <div className="flex items-start gap-3 rounded-2xl border border-sunset/30 bg-sunset/10 px-4 py-3 text-sm text-ink">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunset text-xs font-semibold text-white">!</span>
                <div className="flex-1">
                  <p className="font-medium">QuickBooks token has expired.</p>
                  <p className="text-xs mt-0.5">Exports are disabled until you reconnect. Click &quot;Reconnect&quot; to authorize again.</p>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={actionLoading}
                  className="shrink-0 rounded-2xl bg-azure px-3 py-1.5 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"
                >
                  Reconnect
                </button>
              </div>
            )}
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-neutral-500">Company ID</span>
                <p className="mt-0.5 font-mono text-neutral-800">{status?.realm_id ?? '—'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Connected</span>
                <p className="mt-0.5 text-neutral-800">
                  {status?.connected_at
                    ? new Date(status.connected_at).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">Last sync</span>
                <p className="mt-0.5 text-neutral-800">
                  {status?.last_sync_at
                    ? new Date(status.last_sync_at).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">Token expires</span>
                <p
                  className={`mt-0.5 ${status?.token_expired ? 'text-red-600' : 'text-neutral-800'}`}
                >
                  {status?.token_expiry
                    ? new Date(status.token_expiry).toLocaleDateString()
                    : '—'}
                  {status?.token_expired && ' (expired)'}
                </p>
              </div>
            </div>

            {/* Account sync */}
            <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-neutral-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Chart of Accounts</p>
                <p className="text-xs text-neutral-500">
                  Pull account list from QBO to use in exports
                </p>
              </div>
              <button
                onClick={handleSyncAccounts}
                disabled={actionLoading || !!status?.token_expired}
                title={status?.token_expired ? 'Reconnect QuickBooks to enable sync' : undefined}
                className="rounded-2xl border border-azure/30 bg-white px-3 py-1.5 text-xs font-medium text-azure hover:bg-azure/10 disabled:opacity-50"
              >
                Sync Accounts
              </button>
            </div>

            {/* Account selectors (shown after a sync) */}
            {accounts.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700">
                    Expense Account
                  </label>
                  <select
                    value={expenseAccountId}
                    onChange={(e) => setExpenseAccountId(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    <option value="">Select account…</option>
                    {accounts
                      .filter((a) => a.qb_type === 'Expense')
                      .map((a) => (
                        <option key={a.qb_id} value={a.qb_id}>
                          {a.qb_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700">
                    Bank / Credit Account
                  </label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    <option value="">Select account…</option>
                    {accounts
                      .filter((a) => ['Bank', 'Credit Card'].includes(a.qb_type))
                      .map((a) => (
                        <option key={a.qb_id} value={a.qb_id}>
                          {a.qb_name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Contribution export */}
            <div className="rounded-2xl border border-black/5 bg-neutral-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">Export Contributions</p>
                  <p className="text-xs text-neutral-500">
                    Create journal entries for charitable contributions across all portfolios
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={exportYear}
                    onChange={(e) => setExportYear(Number(e.target.value))}
                    className="rounded-2xl border border-black/10 bg-white px-2 py-1.5 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleExportContributions}
                    disabled={actionLoading || !!status?.token_expired}
                    title={status?.token_expired ? 'Reconnect QuickBooks to enable export' : undefined}
                    className="rounded-2xl border border-azure/30 bg-white px-3 py-1.5 text-xs font-medium text-azure hover:bg-azure/10 disabled:opacity-50"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>

            {/* Grants export */}
            <div className="flex items-center justify-between rounded-2xl border border-black/5 bg-neutral-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Export Grants</p>
                <p className="text-xs text-neutral-500">
                  Create journal entries for all org grants
                </p>
              </div>
              <button
                onClick={handleExportGrants}
                disabled={actionLoading || !!status?.token_expired}
                title={status?.token_expired ? 'Reconnect QuickBooks to enable export' : undefined}
                className="rounded-2xl border border-azure/30 bg-white px-3 py-1.5 text-xs font-medium text-azure hover:bg-azure/10 disabled:opacity-50"
              >
                Export Grants
              </button>
            </div>

            {/* Disconnect */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="text-xs text-neutral-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
              >
                Disconnect QuickBooks
              </button>
            </div>

            {/* Sync History */}
            <div className="pt-2">
              <p className="mb-2 text-xs font-semibold text-neutral-700">Sync History</p>
              {syncLog.length === 0 ? (
                <p className="text-xs text-neutral-400">No sync events yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-black/5">
                  <table className="w-full text-xs text-neutral-700">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Date / Time</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Event</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-neutral-500">Records</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 bg-white">
                      {syncLog.map((entry) => {
                        const eventLabel: Record<string, string> = {
                          accounts_sync: 'Accounts Sync',
                          contributions_export: 'Contributions Export',
                          grants_export: 'Grants Export',
                        };
                        return (
                          <tr key={entry.id}>
                            <td className="whitespace-nowrap px-3 py-2 text-neutral-600">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="px-3 py-2">
                              {eventLabel[entry.event_type] ?? entry.event_type}
                            </td>
                            <td className="px-3 py-2">
                              {entry.status === 'success' ? (
                                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                                  Success
                                </span>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                    Error
                                  </span>
                                  {entry.error_msg && (
                                    <p className="mt-0.5 text-neutral-400">{entry.error_msg}</p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-neutral-600">
                              {entry.record_count ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
