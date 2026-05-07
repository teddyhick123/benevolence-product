'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPE_DESCRIPTIONS,
  AssetType,
  SECTORS,
  HOLDING_STATUSES,
  INVESTMENT_ASSET_TYPES,
  GRANT_ASSET_TYPES,
  DONATION_ASSET_TYPES,
} from '@/lib/schemas/portfolio';

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

type CharitySearchResult = {
  ein: string;
  name: string;
  city?: string;
  state?: string;
  sector?: string;
  annual_revenue?: number;
  source: 'local' | 'propublica';
};

export type HoldingInput = {
  id?: string;
  name?: string;
  asset_type?: string;
  funds_allocated?: number | null;
  status?: string;
  as_of?: string | Date | number; // ISO date string or Date-like
  sector?: string | null;
  country?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
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

  // Focus management: capture trigger, focus first element, restore on close
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
  const [name, setName] = React.useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = React.useState(initial?.asset_type ?? '');
  const [funds, setFunds] = React.useState<string>(
    initial?.funds_allocated != null ? String(initial.funds_allocated) : ''
  );
  const [status, setStatus] = React.useState(initial?.status ?? (initial?.id ? '' : 'Active'));
  const [asOf, setAsOf] = React.useState(dateInputValue(initial?.as_of) || (initial?.id ? '' : new Date().toISOString().slice(0, 10)));
  const [sector, setSector] = React.useState(initial?.sector ?? '');
  const [country, setCountry] = React.useState(initial?.country ?? '');

  // Location fields for geocoding
  const [locationCity, setLocationCity] = React.useState(initial?.location_city ?? '');
  const [locationState, setLocationState] = React.useState(initial?.location_state ?? '');
  const [locationCountry, setLocationCountry] = React.useState(initial?.location_country ?? '');

  // Charity linking state
  const [selectedCharity, setSelectedCharity] = React.useState<CharitySearchResult | null>(null);
  const [charityQuery, setCharityQuery] = React.useState('');
  const [charityResults, setCharityResults] = React.useState<CharitySearchResult[]>([]);
  const [charitySearching, setCharitySearching] = React.useState(false);
  const [showCharityResults, setShowCharityResults] = React.useState(false);
  const charityDebounceRef = React.useRef<NodeJS.Timeout | null>(null);
  const charityContainerRef = React.useRef<HTMLDivElement>(null);

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // reset when initial/open changes
    if (!open) return;
    setName(initial?.name ?? '');
    setAssetClass(initial?.asset_type ?? '');
    setFunds(initial?.funds_allocated != null ? String(initial.funds_allocated) : '');
    setStatus(initial?.status ?? (initial?.id ? '' : 'Active'));
    setAsOf(dateInputValue(initial?.as_of) || (initial?.id ? '' : new Date().toISOString().slice(0, 10)));
    setSector(initial?.sector ?? '');
    setCountry(initial?.country ?? '');
    setLocationCity(initial?.location_city ?? '');
    setLocationState(initial?.location_state ?? '');
    setLocationCountry(initial?.location_country ?? '');
    setSelectedCharity(null);
    setCharityQuery('');
    setCharityResults([]);
    setShowCharityResults(false);
    setError(null);
    setBusy(false);
  }, [initial, open]);

  // Debounced charity search
  React.useEffect(() => {
    if (charityDebounceRef.current) clearTimeout(charityDebounceRef.current);

    if (charityQuery.length < 2) {
      setCharityResults([]);
      setShowCharityResults(false);
      return;
    }

    charityDebounceRef.current = setTimeout(async () => {
      setCharitySearching(true);
      try {
        const res = await fetch(`/api/search-charities?q=${encodeURIComponent(charityQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setCharityResults(data.results || []);
          setShowCharityResults(true);
        }
      } catch {
        // Search failed silently
      } finally {
        setCharitySearching(false);
      }
    }, 400);

    return () => {
      if (charityDebounceRef.current) clearTimeout(charityDebounceRef.current);
    };
  }, [charityQuery]);

  // Close charity dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (charityContainerRef.current && !charityContainerRef.current.contains(e.target as Node)) {
        setShowCharityResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!mounted || !open) return null;

  const close = () => {
    if (!busy) onClose();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Parse funds - only include if valid positive number
    const fundsNum = funds ? Number(funds) : null;
    const validFunds = fundsNum && Number.isFinite(fundsNum) && fundsNum > 0 ? fundsNum : null;

    const payload: any = {
      // canonical snake_case used by DB
      name: name?.trim() || null,
      status: status?.trim() || null,
      asset_type: assetClass?.trim() || null,
      funds_allocated: validFunds,
      as_of: asOf || null, // Already in YYYY-MM-DD format from date input
      sector: sector?.trim() || null,
      country: country?.trim() || null,
      // Location fields for geocoding
      location_city: locationCity?.trim() || null,
      location_state: locationState?.trim() || null,
      location_country: locationCountry?.trim() || null,
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

      // Link charity after creation if one was selected
      if (selectedCharity && j?.data?.id) {
        try {
          await fetch(`/api/holdings/${j.data.id}/link-charity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ein: selectedCharity.ein }),
          });
        } catch {
          // Charity link failed — holding was still created successfully
        }
      }

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
      ref={dialogRef}
      className={clsx(
        'fixed inset-0 z-[10000] flex items-start justify-center p-4 sm:p-6 overflow-y-auto',
        'bg-black/30 backdrop-blur-[1px]'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-holding-title"
      onKeyDown={handleDialogKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl ring-1 ring-black/10 my-auto max-h-[calc(100vh-3rem)] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-black/5 flex-shrink-0">
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

        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto flex-1">
          {error ? (
            <div className="text-sm rounded-md bg-red-50 text-red-700 px-3 py-2 border border-red-200" role="alert">
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
              <div className="mb-1 text-neutral-700">Asset type</div>
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2 bg-white"
              >
                <option value="">Select type...</option>
                <optgroup label="Investment Types">
                  {INVESTMENT_ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>
                  ))}
                </optgroup>
                <optgroup label="Grant Types">
                  {GRANT_ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>
                  ))}
                </optgroup>
                <optgroup label="Donation Types">
                  {DONATION_ASSET_TYPES.filter(t => !GRANT_ASSET_TYPES.includes(t)).map((type) => (
                    <option key={type} value={type}>{ASSET_TYPE_LABELS[type]}</option>
                  ))}
                </optgroup>
                <optgroup label="Other">
                  <option value="other">{ASSET_TYPE_LABELS.other}</option>
                </optgroup>
              </select>
              {assetClass && ASSET_TYPE_DESCRIPTIONS[assetClass as AssetType] && (
                <div className="mt-1.5 text-xs text-neutral-500 bg-neutral-50 rounded-lg px-2.5 py-1.5 border border-neutral-100">
                  {ASSET_TYPE_DESCRIPTIONS[assetClass as AssetType]}
                </div>
              )}
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
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2 bg-white"
              >
                <option value="">Select status...</option>
                {HOLDING_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full rounded-2xl border border-black/10 px-3 py-2 bg-white"
              >
                <option value="">Select sector...</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="Other">Other</option>
              </select>
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

          {/* Location fields for map geocoding */}
          <div className="mt-4 pt-4 border-t border-black/5">
            <div className="mb-2 text-sm font-medium text-neutral-700">
              📍 Location (for map display)
            </div>
            <div className="text-xs text-neutral-500 mb-3">
              Add location details to display this holding on the map. The system will automatically geocode the address.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-neutral-700">City</div>
                <input
                  value={locationCity}
                  onChange={(e) => setLocationCity(e.target.value)}
                  placeholder="San Francisco"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-neutral-700">State/Province</div>
                <input
                  value={locationState}
                  onChange={(e) => setLocationState(e.target.value)}
                  placeholder="CA"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2"
                />
              </label>

              <label className="text-sm">
                <div className="mb-1 text-neutral-700">Country</div>
                <input
                  value={locationCountry}
                  onChange={(e) => setLocationCountry(e.target.value)}
                  placeholder="USA"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2"
                />
              </label>
            </div>
          </div>

          {/* Charity linking (optional) */}
          <div className="mt-4 pt-4 border-t border-black/5">
            <div className="mb-2 text-sm font-medium text-neutral-700">
              Link Nonprofit (optional)
            </div>
            <div className="text-xs text-neutral-500 mb-3">
              Search for a registered nonprofit to link public financial data.
            </div>

            {selectedCharity ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{selectedCharity.name}</p>
                    <p className="text-xs text-neutral-500">
                      EIN: {selectedCharity.ein}
                      {selectedCharity.city && selectedCharity.state && ` \u00B7 ${selectedCharity.city}, ${selectedCharity.state}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCharity(null)}
                  className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-500 transition-colors"
                  aria-label="Remove charity"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div ref={charityContainerRef} className="relative">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={charityQuery}
                    onChange={(e) => setCharityQuery(e.target.value)}
                    placeholder="Search by nonprofit name or EIN..."
                    className="w-full pl-10 pr-4 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure/50 bg-white"
                  />
                  {charitySearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-azure/30 border-t-azure rounded-full animate-spin" />
                    </div>
                  )}
                </div>

                {showCharityResults && charityResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-neutral-200 shadow-lg max-h-48 overflow-y-auto">
                    {charityResults.map((r, idx) => (
                      <button
                        key={`${r.ein}-${idx}`}
                        type="button"
                        onClick={() => {
                          setSelectedCharity(r);
                          setCharityQuery('');
                          setCharityResults([]);
                          setShowCharityResults(false);
                          // Auto-populate fields from charity data
                          if (!name && r.name) setName(r.name);
                          if (!sector && r.sector) setSector(r.sector);
                          if (!locationCity && r.city) setLocationCity(r.city);
                          if (!locationState && r.state) setLocationState(r.state);
                          if (!locationCountry) setLocationCountry('USA');
                          // Suggest donation as asset type for nonprofits
                          if (!assetClass) setAssetClass('donation');
                        }}
                        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left border-b border-neutral-100 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">{r.name}</p>
                          <p className="text-xs text-neutral-500">
                            EIN: {r.ein}
                            {r.city && r.state && ` \u00B7 ${r.city}, ${r.state}`}
                          </p>
                        </div>
                        <span className="flex-shrink-0 ml-2 text-xs text-azure font-medium">Select</span>
                      </button>
                    ))}
                  </div>
                )}

                {showCharityResults && charityQuery.length >= 2 && charityResults.length === 0 && !charitySearching && (
                  <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-neutral-200 shadow-lg p-3">
                    <p className="text-xs text-neutral-500 text-center">No charities found</p>
                  </div>
                )}
              </div>
            )}
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