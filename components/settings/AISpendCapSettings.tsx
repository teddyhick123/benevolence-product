'use client';

import { useState, type FormEvent } from 'react';
import { requestJson } from '@/lib/api/client';

type Cap = {
  state: 'uncapped' | 'under' | 'warn' | 'over';
  onLimit: 'hard_stop' | 'read_only' | 'own_key';
  effectiveLimitUsd: number | null;
  platformLimitUsd: number | null;
  orgLimitUsd: number | null;
  warnAtPercent: number;
};

const BEHAVIOUR_OPTIONS = [
  { id: 'hard_stop' as const, label: 'Stop new requests' },
  { id: 'read_only' as const, label: 'Keep answering, no changes' },
  { id: 'own_key' as const, label: 'Switch to our own model' },
];

export default function AISpendCapSettings({
  orgId,
  cap,
  hasActiveDeployment,
  onSaved,
}: {
  orgId: string;
  cap: Cap;
  hasActiveDeployment: boolean;
  onSaved?: () => void;
}) {
  const [orgLimit, setOrgLimit] = useState(cap.orgLimitUsd?.toString() ?? '');
  const [onLimit, setOnLimit] = useState(cap.onLimit);
  const [warnAt, setWarnAt] = useState(cap.warnAtPercent);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await requestJson(`/api/org/${orgId}/ai-settings/spend-cap`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgLimitUsd: orgLimit.trim() === '' ? null : Number(orgLimit),
          onLimit,
          warnAtPercent: warnAt,
        }),
      });
      setNotice('Spend limit saved.');
      onSaved?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The limit could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">Spend limit</h2>
        <p className="text-sm text-gray-500">
          Applies to platform-funded usage only. Usage on your own provider key is
          billed by that provider and is not limited here.
        </p>
      </div>

      {notice && <div className="rounded border border-azure/20 px-3 py-2 text-sm">{notice}</div>}

      <form className="space-y-3" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Your monthly limit (USD)
            </span>
            <input
              aria-label="Your monthly limit"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              type="number"
              min={0}
              step="0.01"
              value={orgLimit}
              onChange={event => setOrgLimit(event.target.value)}
              placeholder="No limit"
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs uppercase tracking-wide text-gray-500">At the limit</span>
            <select
              aria-label="At the limit"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              value={onLimit}
              onChange={event => setOnLimit(event.target.value as Cap['onLimit'])}
            >
              {BEHAVIOUR_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-xs uppercase tracking-wide text-gray-500">Warn at (%)</span>
            <input
              aria-label="Warn at percent"
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              type="number"
              min={1}
              max={100}
              value={warnAt}
              onChange={event => setWarnAt(Number(event.target.value))}
            />
          </label>
        </div>

        {/* own_key needs somewhere to fall back to. Stating it here beats an
            administrator discovering it when the assistant stops instead. */}
        {onLimit === 'own_key' && !hasActiveDeployment && (
          <p className="rounded border border-sunset/40 bg-sunset/10 px-3 py-2 text-xs text-gray-800">
            You have no active model deployment to switch to, so requests will stop
            at the limit instead. Add a connection and deployment to use this option.
          </p>
        )}

        <p className="text-xs text-gray-500">
          {cap.platformLimitUsd === null
            ? 'No platform ceiling is set for this organization.'
            : `Platform ceiling: $${cap.platformLimitUsd.toFixed(2)}. Your limit cannot exceed it.`}
        </p>

        <button className="rounded bg-azure px-4 py-2 text-sm text-white" disabled={busy}>
          Save limit
        </button>
      </form>
    </section>
  );
}
