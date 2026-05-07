'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

export type KpiInput = {
  id?: string;
  label?: string;          // display title on the card
  metric_code?: string;    // canonical code (e.g., RENEWABLE_MWH)
  value?: number | null;   // latest value (optional if computed elsewhere)
  unit?: string | null;    // e.g., 'MWh', 'tCO2e', '%', '$'
  as_of?: string | null;   // ISO datetime
  period_start?: string | null; // ISO date
  period_end?: string | null;   // ISO date
  notes?: string | null;   // optional footnote/description
};

export type EditKpiModalProps = {
  portfolioId: string;
  /** if provided, we are editing; otherwise creating */
  initial?: KpiInput | null;
  open: boolean;
  onClose: () => void;
  /** called after a successful save/delete so the parent can refresh */
  onChanged?: () => void;
};

export default function EditKpiModal({ portfolioId, initial, open, onClose, onChanged }: EditKpiModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<Element | null>(null);

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

  // Focus management
  React.useEffect(() => {
    if (!mounted) return;
    if (open) {
      triggerRef.current = document.activeElement;
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus?.();
    }
  }, [open, mounted]);

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  const isEditing = Boolean(initial?.id);

  const [label, setLabel] = React.useState(initial?.label ?? '');
  const [metricCode, setMetricCode] = React.useState(initial?.metric_code ?? '');
  const [value, setValue] = React.useState<string>(
    initial?.value != null && isFinite(Number(initial.value)) ? String(initial.value) : ''
  );
  const [unit, setUnit] = React.useState(initial?.unit ?? '');
  const [asOf, setAsOf] = React.useState(initial?.as_of ? initial.as_of.slice(0, 10) : '');
  const [periodStart, setPeriodStart] = React.useState(initial?.period_start ? initial.period_start.slice(0, 10) : '');
  const [periodEnd, setPeriodEnd] = React.useState(initial?.period_end ? initial.period_end.slice(0, 10) : '');
  const [notes, setNotes] = React.useState(initial?.notes ?? '');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? '');
    setMetricCode(initial?.metric_code ?? '');
    setValue(initial?.value != null && isFinite(Number(initial.value)) ? String(initial.value) : '');
    setUnit(initial?.unit ?? '');
    setAsOf(initial?.as_of ? initial.as_of.slice(0, 10) : '');
    setPeriodStart(initial?.period_start ? initial.period_start.slice(0, 10) : '');
    setPeriodEnd(initial?.period_end ? initial.period_end.slice(0, 10) : '');
    setNotes(initial?.notes ?? '');
    setError(null);
    setBusy(false);
  }, [initial, open]);

  if (!mounted || !open) return null;

  const close = () => { if (!busy) onClose(); };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // minimal validation
    if (!label.trim()) {
      setBusy(false);
      setError('Please enter a KPI title');
      return;
    }

    const payload: any = {
      label: label.trim(),
      metric_code: metricCode.trim() || null,
      value: value === '' ? null : Number(value),
      unit: unit.trim() || null,
      as_of: asOf ? new Date(asOf).toISOString() : null,
      period_start: periodStart ? new Date(periodStart).toISOString() : null,
      period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
      notes: notes?.trim() || null,
    };

    try {
      const url = isEditing
        ? `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis/${encodeURIComponent(initial!.id!)}`
        : `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis`;
      const method = isEditing ? 'PATCH' : 'POST';
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
    if (!confirm('Delete this KPI? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      const url = `/api/portfolio/${encodeURIComponent(portfolioId)}/kpis/${encodeURIComponent(initial.id)}`;
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
      ref={dialogRef}
      className={clsx('fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6', 'bg-black/30 backdrop-blur-[1px]')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-kpi-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-black/5">
          <div className="min-w-0">
            <h3 id="edit-kpi-title" className="text-base font-semibold text-neutral-900">
              {isEditing ? 'Edit KPI' : 'Add KPI'}
            </h3>
            <p className="mt-0.5 text-sm text-neutral-600 truncate">
              {isEditing ? (label || initial?.label || '—') : 'Create a KPI card for this portfolio'}
            </p>
          </div>
          <button type="button" onClick={close} className="rounded-full p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-black/5" aria-label="Close">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {error ? (
            <div className="text-sm rounded-md bg-red-50 text-red-700 px-3 py-2 border border-red-200" role="alert">{error}</div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <div className="mb-1 text-neutral-700">KPI title</div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Renewable MWh"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Metric code</div>
              <input
                value={metricCode}
                onChange={(e) => setMetricCode(e.target.value)}
                placeholder="RENEWABLE_MWH"
                className="w-full rounded-2xl border border-black/10 px-3 py-2 font-mono"
              />
              <div className="text-xs text-neutral-500 mt-1">Use canonical codes where possible.</div>
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Value</div>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="128500"
                className="w-full rounded-2xl border border-black/10 px-3 py-2 text-right tabular-nums"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Unit</div>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="MWh / tCO2e / % / $"
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
              <div className="mb-1 text-neutral-700">Period start</div>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <div className="mb-1 text-neutral-700">Period end</div>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>

            <label className="sm:col-span-2 text-sm">
              <div className="mb-1 text-neutral-700">Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Short footnote or calculation details (optional)"
                className="w-full rounded-2xl border border-black/10 px-3 py-2"
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            {isEditing ? (
              <button
                type="button"
                onClick={handleDelete}
                className={clsx('text-sm inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5', 'border border-red-200 text-red-700 hover:bg-red-50')}
                disabled={busy}
              >
                <TrashIcon className="h-4 w-4" />
                Delete
              </button>
            ) : <span />}

            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="text-sm rounded-2xl px-3 py-1.5 border border-black/10 hover:bg-black/5" disabled={busy}>Cancel</button>
              <button
                type="submit"
                className={clsx('text-sm inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5', 'bg-azure text-white shadow-soft hover:opacity-90 disabled:opacity-60')}
                disabled={busy}
              >
                {busy ? 'Saving…' : (isEditing ? 'Save changes' : 'Add KPI')}
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
