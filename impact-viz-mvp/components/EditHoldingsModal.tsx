'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

function dateInputValue(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : (v as Date).toISOString().slice(0, 10);
  }
  // handle numbers or other serializable date-like values
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export type HoldingInput = {
  id?: string;
  name?: string;
  asset_class?: string;
  funds_allocated?: number | null;
  status?: string;
  as_of?: string | Date | number; // ISO date string or Date-like
  sector?: string | null;
  country?: string | null;
};

export type EditHoldingsModalProps = {
  portfolioId: string;
  /** if provided, we are editing; otherwise creating */
  initial?: HoldingInput | null;
  open: boolean;
  onClose: () => void;
  /** called after a successful save/delete so the parent can refresh */
  onChanged?: () => void;
};

export default function EditHoldingsModal({ portfolioId, initial, open, onClose, onChanged }: EditHoldingsModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // lock body scroll while modal is open
  React.useEffect(() => {
    if (!mounted) return;
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, mounted]);

  const isEditing = Boolean(initial?.id);
  const [name, setName] = React.useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = React.useState(initial?.asset_class ?? '');
  const [funds, setFunds] = React.useState<string>(
    initial?.funds_allocated != null ? String(initial.funds_allocated) : ''
  );
  const [status, setStatus] = React.useState(initial?.status ?? '');
  const [asOf, setAsOf] = React.useState(dateInputValue(initial?.as_of));
  const [sector, setSector] = React.useState(initial?.sector ?? '');
  const [country, setCountry] = React.useState(initial?.country ?? '');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // reset when initial/open changes
    if (!open) return;
    setName(initial?.name ?? '');
    setAssetClass(initial?.asset_class ?? '');
    setFunds(initial?.funds_allocated != null ? String(initial.funds_allocated) : '');
    setStatus(initial?.status ?? '');
    setAsOf(dateInputValue(initial?.as_of));
    setSector(initial?.sector ?? '');
    setCountry(initial?.country ?? '');
    setError(null);
    setBusy(false);
  }, [initial, open]);

  if (!mounted || !open) return null;

  const close = () => {
    if (!busy) onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload: any = {
      // canonical snake_case used by DB
      name: name?.trim() || null,
      status: status?.trim() || null,
      asset_class: assetClass?.trim() || null,
      funds_allocated: funds === '' ? null : Number(funds),
      as_of: asOf ? new Date(asOf).toISOString() : null,
      sector: sector?.trim() || null,
      country: country?.trim() || null,
      // camelCase mirrors for handlers that expect it
      assetClass: assetClass?.trim() || null,
      fundsAllocated: funds === '' ? null : Number(funds),
      asOf: asOf || null,
    };

    try {
      const url = isEditing
        ? `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings/${encodeURIComponent(initial!.id!)}`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings`;
      const method = isEditing ? 'PATCH' : 'POST';

      // basic client-side guard
      if (!payload.name && !isEditing) {
        setBusy(false);
        setError('Please enter a holding name.');
        return;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Request failed');
      onChanged?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!isEditing || !initial?.id) return;
    if (!confirm(`Delete "${initial?.name ?? name ?? 'this holding'}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const url = `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings/${encodeURIComponent(initial.id)}`;
      const res = await fetch(url, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Delete failed');
      onChanged?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6',
        'bg-black/30 backdrop-blur-[1px]'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-holding-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-black/5">
          <div className="min-w-0">
            <h3 id="edit-holding-title" className="text-base font-semibold text-neutral-900">
              {isEditing ? 'Edit holding' : 'Add holding'}
            </h3>
            <p className="mt-0.5 text-sm text-neutral-600 truncate">
              {isEditing ? name || initial?.name || '—' : 'Create a new holding for this portfolio'}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-black/5"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error ? (
            <div className="text-sm rounded-md bg-red-50 text-red-700 px-3 py-2 border border-red-200">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Holding name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Solar SPV"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Asset class</div>
              <input
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value)}
                placeholder="Private Equity / Debt / Infra"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Funds allocated</div>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={funds}
                onChange={(e) => setFunds(e.target.value)}
                placeholder="1000000"
                className="w-full rounded-2xl border border-black/10 px-3 py-2 text-right tabular-nums"
              />
              <div className="text-xs text-neutral-500 mt-1">Base currency of the portfolio.</div>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Status</div>
              <input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="Active / Exited / On hold"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">As of date</div>
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Sector</div>
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Renewables / Healthcare / Education"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Country</div>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="US / CA / MX"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                className={clsx(
                  'text-sm inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5',
                  'border border-red-200 text-red-700 hover:bg-red-50'
                )}
                disabled={busy}
              >
                <TrashIcon className="h-4 w-4" />
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={close}
                className="text-sm rounded-2xl px-3 py-1.5 border border-black/10 hover:bg-black/5"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={clsx(
                  'text-sm inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5',
                  'bg-azure text-white shadow-soft hover:opacity-90 disabled:opacity-60'
                )}
                disabled={busy}
              >
                {busy ? 'Saving…' : (isEditing ? 'Save changes' : 'Add holding')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 8a1 1 0 112 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" />
      <path fillRule="evenodd" d="M4 6h12l-1 11a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6zm3-3a2 2 0 012-2h2a2 2 0 012 2v1h3a1 1 0 110 2H4a1 1 0 010-2h3V3z" clipRule="evenodd" />
    </svg>
  );
}