'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { GRANT_RISK_BADGE, grantStageBadgeClass, grantStageLabel } from './grantPalette';
import type { GrantListItem } from './GrantPipelineView';

function fmt(v: number | null | undefined, currency = 'USD'): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

interface OrgMember { id: string; display_name?: string | null; email?: string | null }

interface Props {
  grants: GrantListItem[];
  members?: OrgMember[];
  onNewGrant?: () => void;
}

type SortKey = 'name' | 'stage' | 'amount' | 'period_end' | 'risk';
type SortDir = 'asc' | 'desc';

export default function GrantTableView({ grants, members = [], onNewGrant }: Props) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('period_end');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) {
      m.set(mb.id, mb.display_name ?? mb.email ?? mb.id.slice(0, 8));
    }
    return m;
  }, [members]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const filtered = useMemo(() => {
    let rows = grants;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(g => (g.holdings?.name ?? '').toLowerCase().includes(q));
    }
    if (stageFilter) rows = rows.filter(g => g.lifecycle_stage === stageFilter);
    if (riskFilter) rows = rows.filter(g => g.risk_level === riskFilter);
    if (ownerFilter) rows = rows.filter(g => g.internal_owner_id === ownerFilter);

    rows = [...rows].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'name') { va = a.holdings?.name ?? ''; vb = b.holdings?.name ?? ''; }
      if (sortKey === 'stage') { va = LIFECYCLE_STAGES.indexOf(a.lifecycle_stage); vb = LIFECYCLE_STAGES.indexOf(b.lifecycle_stage); }
      if (sortKey === 'amount') { va = a.approved_amount ?? a.requested_amount ?? 0; vb = b.approved_amount ?? b.requested_amount ?? 0; }
      if (sortKey === 'period_end') { va = a.grant_period_end ?? '9999'; vb = b.grant_period_end ?? '9999'; }
      if (sortKey === 'risk') {
        const order = { critical: 0, high: 1, medium: 2, low: 3, '': 4 };
        va = (order as any)[a.risk_level ?? ''] ?? 4;
        vb = (order as any)[b.risk_level ?? ''] ?? 4;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [grants, search, stageFilter, riskFilter, ownerFilter, sortKey, sortDir]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-neutral-300 ml-1">↕</span>;
    return <span className="text-azure ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const th = 'px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer select-none hover:text-neutral-700';

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-ink">No grants yet</p>
          <p className="text-sm text-neutral-500 mt-1">Add grants to see them in the table view.</p>
        </div>
        {onNewGrant && (
          <button onClick={onNewGrant} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Grant
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search grantees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
          />
        </div>

        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
        >
          <option value="">All Stages</option>
          {LIFECYCLE_STAGES.map(s => (
            <option key={s} value={s}>{grantStageLabel(s)}</option>
          ))}
        </select>

        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
        >
          <option value="">All Risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {members.length > 0 && (
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
          >
            <option value="">All Owners</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name ?? m.email ?? m.id.slice(0, 8)}</option>
            ))}
          </select>
        )}

        {(search || stageFilter || riskFilter || ownerFilter) && (
          <button
            onClick={() => { setSearch(''); setStageFilter(''); setRiskFilter(''); setOwnerFilter(''); }}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-neutral-400">{filtered.length} grant{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">No grants match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-black/5">
                <tr>
                  <th className={th} onClick={() => handleSort('name')}>
                    Grantee <SortIcon col="name" />
                  </th>
                  <th className={th} onClick={() => handleSort('stage')}>
                    Stage <SortIcon col="stage" />
                  </th>
                  <th className={th} onClick={() => handleSort('amount')}>
                    Amount <SortIcon col="amount" />
                  </th>
                  <th className={th} onClick={() => handleSort('risk')}>
                    Risk <SortIcon col="risk" />
                  </th>
                  <th className={th} onClick={() => handleSort('period_end')}>
                    Period End <SortIcon col="period_end" />
                  </th>
                  {members.length > 0 && <th className={th}>Owner</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map(g => {
                  const amount = g.approved_amount ?? g.requested_amount;
                  const days = daysUntil(g.grant_period_end);
                  return (
                    <tr key={g.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/grants/${g.id}`} className="font-medium text-ink hover:text-azure truncate block max-w-[200px]">
                          {g.holdings?.name ?? 'Unnamed'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={grantStageBadgeClass(g.lifecycle_stage)}>
                          {grantStageLabel(g.lifecycle_stage)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700 font-medium">{fmt(amount, g.currency ?? 'USD')}</td>
                      <td className="px-4 py-3">
                        {g.risk_level ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${GRANT_RISK_BADGE[g.risk_level] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
                            {g.risk_level}
                          </span>
                        ) : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-neutral-600">{fmtDate(g.grant_period_end)}</span>
                        {days !== null && (
                          <span className={`ml-1.5 text-xs ${days < 0 ? 'text-red-500' : days < 30 ? 'text-coral' : 'text-neutral-400'}`}>
                            ({days < 0 ? `${Math.abs(days)}d ago` : `${days}d`})
                          </span>
                        )}
                      </td>
                      {members.length > 0 && (
                        <td className="px-4 py-3 text-neutral-500 text-xs">
                          {g.internal_owner_id ? (memberMap.get(g.internal_owner_id) ?? '—') : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/grants/${g.id}`} className="text-xs text-azure hover:underline">
                          Open →
                        </Link>
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
  );
}
