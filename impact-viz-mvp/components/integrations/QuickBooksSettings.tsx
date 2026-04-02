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
  qb_account_id: string;
  name: string;
  type: string;
}

interface Props {
  portfolioId: string;
}

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);

export default function QuickBooksSettings({ portfolioId }: Props) {
  const [status, setStatus] = useState<QBStatus | null>(null);
  const [accounts, setAccounts] = useState<QBAccount[]>([]);
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
        `/api/integrations/quickbooks/status?portfolio_id=${portfolioId}`
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
  }, [portfolioId]);

  useEffect(() => {
    void fetchStatus().then((s) => {
      if (s?.connected) void loadAccounts();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-select expense / bank accounts when account list changes
  useEffect(() => {
    if (accounts.length === 0) return;
    const expenseAcct = accounts.find(
      (a) =>
        a.type === 'Expense' &&
        a.name.toLowerCase().includes('charit')
    );
    const bankAcct = accounts.find((a) => a.type === 'Bank');
    if (expenseAcct && !expenseAccountId) setExpenseAccountId(expenseAcct.qb_account_id);
    if (bankAcct && !bankAccountId) setBankAccountId(bankAcct.qb_account_id);
  }, [accounts, expenseAccountId, bankAccountId]);

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  }

  async function handleConnect() {
    window.location.href = `/api/integrations/quickbooks/connect?portfolio_id=${portfolioId}`;
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect from QuickBooks? This will remove all synced account data.')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/integrations/quickbooks/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_id: portfolioId }),
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
        body: JSON.stringify({ portfolio_id: portfolioId }),
      });
      const d = (await res.json()) as { ok?: boolean; synced?: number; error?: string };
      if (d.ok) {
        showMsg('success', `Synced ${d.synced ?? 0} accounts.`);
        await fetchStatus();
        // Refresh account list for dropdowns
        await loadAccounts();
      } else {
        showMsg('error', d.error ?? 'Sync failed.');
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const res = await fetch(
        `/api/integrations/quickbooks/accounts?portfolio_id=${portfolioId}`
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
          portfolio_id: portfolioId,
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
          portfolio_id: portfolioId,
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
      <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-4 w-48 rounded bg-gray-200" />
        <div className="mt-3 h-3 w-32 rounded bg-gray-100" />
      </div>
    );
  }

  const isConnected = status?.connected ?? false;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          {/* QuickBooks logo mark */}
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2CA01C] text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 14.5v-2.25H9A2.75 2.75 0 019 8.25h2V6l4 4-4 4v-1.5zm2-4h2a.75.75 0 000-1.5h-2v1.5zm0 2.5v-1h2A2.75 2.75 0 0015 8.75h-2V7l-4 4 4 4v-1.5h-1.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">QuickBooks Online</h2>
            <p className="text-xs text-gray-500">
              Sync accounts and export transactions to QBO
            </p>
          </div>
        </div>

        {/* Connection badge */}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isConnected
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-gray-400'
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
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {!isConnected ? (
          /* ---- Not connected state ---- */
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-gray-600">
              Connect your QuickBooks Online account to export charitable contributions and
              grants as journal entries.
            </p>
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              Connect to QuickBooks
            </button>
          </div>
        ) : (
          /* ---- Connected state ---- */
          <div className="space-y-5">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Company ID</span>
                <p className="mt-0.5 font-mono text-gray-800">{status?.realm_id ?? '—'}</p>
              </div>
              <div>
                <span className="text-gray-500">Connected</span>
                <p className="mt-0.5 text-gray-800">
                  {status?.connected_at
                    ? new Date(status.connected_at).toLocaleDateString()
                    : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Last sync</span>
                <p className="mt-0.5 text-gray-800">
                  {status?.last_sync_at
                    ? new Date(status.last_sync_at).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Token expires</span>
                <p
                  className={`mt-0.5 ${status?.token_expired ? 'text-red-600' : 'text-gray-800'}`}
                >
                  {status?.token_expiry
                    ? new Date(status.token_expiry).toLocaleDateString()
                    : '—'}
                  {status?.token_expired && ' (expired)'}
                </p>
              </div>
            </div>

            {/* Account sync */}
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Chart of Accounts</p>
                <p className="text-xs text-gray-500">
                  Pull account list from QBO to use in exports
                </p>
              </div>
              <button
                onClick={handleSyncAccounts}
                disabled={actionLoading}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                Sync Accounts
              </button>
            </div>

            {/* Account selectors (shown after a sync) */}
            {accounts.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Expense Account
                  </label>
                  <select
                    value={expenseAccountId}
                    onChange={(e) => setExpenseAccountId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select account…</option>
                    {accounts
                      .filter((a) => a.type === 'Expense')
                      .map((a) => (
                        <option key={a.qb_account_id} value={a.qb_account_id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Bank / Credit Account
                  </label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select account…</option>
                    {accounts
                      .filter((a) => ['Bank', 'Credit Card'].includes(a.type))
                      .map((a) => (
                        <option key={a.qb_account_id} value={a.qb_account_id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* Contribution export */}
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">Export Contributions</p>
                  <p className="text-xs text-gray-500">
                    Create journal entries for charitable contributions
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={exportYear}
                    onChange={(e) => setExportYear(Number(e.target.value))}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {YEAR_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleExportContributions}
                    disabled={actionLoading}
                    className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>

            {/* Grants export */}
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">Export Grants</p>
                <p className="text-xs text-gray-500">
                  Create journal entries for all portfolio grants
                </p>
              </div>
              <button
                onClick={handleExportGrants}
                disabled={actionLoading}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
              >
                Export Grants
              </button>
            </div>

            {/* Disconnect */}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="text-xs text-gray-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
              >
                Disconnect QuickBooks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
