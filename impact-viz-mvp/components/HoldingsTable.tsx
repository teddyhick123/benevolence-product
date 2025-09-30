'use client';
import React, { useMemo, useState, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import EditHoldingsModal from './EditHoldingsModal';

function parseDateISO(d?: string | null) {
  if (!d) return null;
  const t = Date.parse(d);
  return isNaN(t) ? null : t;
}
function fmtDate(d?: string | null) {
  const t = parseDateISO(d);
  if (t == null) return '—';
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(t));
}

type SimpleRow = {
  id?: string;
  name?: string | null;
  holding_name?: string | null; // legacy
  funds_allocated?: number | null;
  nav?: number | null; // legacy
  asset_class?: string | null;
  instrument_type?: string | null;
  as_of?: string | null; // canonical 'YYYY-MM-DD'
  as_of_date?: string | null; // legacy
  last_updated?: string | null; // legacy fallback
  status?: string | null;
  sector?: string | null;
  country?: string | null;
  investees?: { display_name?: string | null; sector?: string | null; country?: string | null } | Array<{ display_name?: string | null; sector?: string | null; country?: string | null }> | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !isFinite(Number(n))) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));
}

// Colored tag palette and stable hashing for label -> color mapping
const TAG_PALETTE = [
  { bg: 'bg-azure/10', text: 'text-azure', border: 'border-azure/20' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/20' },
  { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/20' },
  { bg: 'bg-violet-500/10', text: 'text-violet-600', border: 'border-violet-500/20' },
  { bg: 'bg-rose-500/10', text: 'text-rose-600', border: 'border-rose-500/20' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-600', border: 'border-cyan-500/20' },
];
function pickTagClass(label: string) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const { bg, text, border } = TAG_PALETTE[hash % TAG_PALETTE.length];
  return `${bg} ${text} ${border}`;
}

function Pill({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  const label = String(children);
  const color = pickTagClass(label);
  return (
    <span className={`inline-flex items-center px-2 py-[2px] rounded-full text-xs border ${color}`}>
      {label}
    </span>
  );
}

/**
 * HoldingsTable
 * - Accepts rows from our API or a simple array and normalizes them
 * - Styled to match crème + grey-azure theme
 */
export default function HoldingsTable({ rows, canEdit = false, onEditRow, portfolioId }: { rows: SimpleRow[]; canEdit?: boolean; onEditRow?: (row: any, index: number) => void; portfolioId?: string }) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'funds', direction: 'desc' });
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRaw, setSelectedRaw] = useState<any | null>(null);

  const params = useParams();
  const searchParams = useSearchParams();
  const routePortfolioId = (params as any)?.portfolio_id || (params as any)?.id || searchParams.get('portfolio_id') || searchParams.get('id');
  const effectivePortfolioId = portfolioId ?? (routePortfolioId ? String(routePortfolioId) : undefined);

  const data = useMemo(() => {
    const arr = Array.isArray(rows) ? rows : [];
    const normalized = arr.map((r) => {
      const inv = Array.isArray(r.investees) ? (r.investees[0] ?? null) : (r.investees ?? null);

      const name = r.name || r.holding_name || inv?.display_name || '—';
      const funds = r.funds_allocated != null ? Number(r.funds_allocated)
                   : (r as any).nav != null ? Number((r as any).nav)
                   : null;
      const assetClass = r.asset_class ?? '—';

      // Prefer canonical as_of; fall back to legacy fields
      const asOfRaw =
        parseDateISO(r.as_of) ??
        parseDateISO(r.as_of_date) ??
        parseDateISO(r.last_updated);

      const asOfLabel =
        r.as_of ? fmtDate(r.as_of) :
        r.as_of_date ? fmtDate(r.as_of_date) :
        r.last_updated ? fmtDate(r.last_updated) : '—';

      const sector = r.sector ?? inv?.sector ?? null;
      const country = r.country ?? inv?.country ?? null;
      const status = r.status ?? '—';
      const holdingId = (r as any)?.id ?? (r as any)?.raw?.id ?? null;
      return { name, funds, assetClass, asOfRaw, asOfLabel, sector, country, status, holdingId, raw: r };
    });

    const { key, direction } = sortConfig;

    normalized.sort((a, b) => {
      // Handle null or undefined values
      let aVal = (a as any)[key];
      let bVal = (b as any)[key];

      if (aVal == null) aVal = direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      if (bVal == null) bVal = direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

      // For funds, compare as numbers
      if (key === 'funds') {
        const aNum = a.funds == null ? (direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : Number(a.funds);
        const bNum = b.funds == null ? (direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : Number(b.funds);
        return direction === 'asc' ? (aNum - bNum) : (bNum - aNum);
      }

      // For dates, compare epoch millis
      if (key === 'asOfRaw') {
        const aTime = a.asOfRaw == null ? (direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : a.asOfRaw;
        const bTime = b.asOfRaw == null ? (direction === 'asc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY) : b.asOfRaw;
        return direction === 'asc' ? (Number(aTime) - Number(bTime)) : (Number(bTime) - Number(aTime));
      }

      const aValAny = (a as any)[key];
      const bValAny = (b as any)[key];
      const aStr = String(aValAny ?? '').toLowerCase();
      const bStr = String(bValAny ?? '').toLowerCase();

      if (aStr < bStr) return direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return normalized;
  }, [rows, sortConfig]);

  const totalFunds = useMemo(() => {
    return data.reduce((sum, r: any) => sum + (r.funds != null && isFinite(Number(r.funds)) ? Number(r.funds) : 0), 0);
  }, [data]);

  const requestSort = useCallback((key: string) => {
    setSortConfig((current) => {
      if (current.key === key) {
        // Toggle direction
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const getSortIndicator = (key: string) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  if (!data.length) {
    return (
      <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
        No holdings yet. Once you upload a report, holdings will appear here.
        {canEdit ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => onEditRow?.(null as any, -1)}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
            >
              Add holding
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white">
            <tr className="border-b border-black/5">
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('name')}
                aria-sort={sortConfig.key==='name' ? (sortConfig.direction==='asc' ? 'ascending' : 'descending') : 'none'}
              >
                Holding{getSortIndicator('name')}
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('assetClass')}
                aria-sort={sortConfig.key==='assetClass' ? (sortConfig.direction==='asc' ? 'ascending' : 'descending') : 'none'}
              >
                Asset Class{getSortIndicator('assetClass')}
              </th>
              <th className="text-left px-3 py-2 font-medium text-neutral-700">
                Tags
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('asOfRaw')}
                aria-sort={sortConfig.key==='asOfRaw' ? (sortConfig.direction==='asc' ? 'ascending' : 'descending') : 'none'}
              >
                As of{getSortIndicator('asOfRaw')}
              </th>
              <th
                className="text-left px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('status')}
                aria-sort={sortConfig.key==='status' ? (sortConfig.direction==='asc' ? 'ascending' : 'descending') : 'none'}
              >
                Status{getSortIndicator('status')}
              </th>
              <th
                className="text-right px-3 py-2 font-medium text-neutral-700 cursor-pointer select-none"
                onClick={() => requestSort('funds')}
                aria-sort={sortConfig.key==='funds' ? (sortConfig.direction==='asc' ? 'ascending' : 'descending') : 'none'}
              >
                Funds Allocated{getSortIndicator('funds')}
              </th>
              {canEdit ? (
                <th className="w-px px-2 py-2 text-right font-medium text-neutral-700">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => {
              const holdingId = (r as any)?.holdingId ?? null;
              const href = holdingId ? `/dashboard/holdings/${encodeURIComponent(String(holdingId))}` : null;

              const isClickable = Boolean(href);

              return (
                <tr
                  key={i}
                  className={`border-b border-black/5 transition-colors ${isClickable ? 'cursor-pointer hover:bg-azure/10' : 'hover:bg-azure/5'}`}
                  onClick={() => {
                    if (href) router.push(href);
                  }}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : -1}
                  aria-label={isClickable ? `Open ${r.name} details` : undefined}
                  onKeyDown={(e) => {
                    if (!href) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      router.push(href);
                    }
                  }}
                >
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.assetClass}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Pill>{r.sector}</Pill>
                      <Pill>{r.country}</Pill>
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.asOfLabel}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney((r as any).funds)}</td>
                  {canEdit ? (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onEditRow) {
                            onEditRow(r.raw ?? r, i);
                          } else {
                            setSelectedRaw(r.raw ?? r);
                            setModalOpen(true);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-2.5 py-1 text-xs transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/5 bg-azure/5">
              <td className="px-3 py-2 font-medium text-neutral-700" colSpan={canEdit ? 5 : 5}>Total</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtMoney(totalFunds)}</td>
              {canEdit ? <td className="px-2 py-2" /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit && !onEditRow && portfolioId ? (
        <EditHoldingsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            router.refresh();
          }}
          onDeleted={() => {
            setModalOpen(false);
            router.refresh();
          }}
          portfolioId={portfolioId}
          holding={selectedRaw}
        />
      ) : null}
    </div>
  );
}
