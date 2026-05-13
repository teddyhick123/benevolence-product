'use client';
import { useState, useCallback } from 'react';
import useSWR from 'swr';
import PledgeCreateModal from './PledgeCreateModal';
import PledgeDetailPanel from './PledgeDetailPanel';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const STATUS_BADGE: Record<string, string> = {
  overdue:   'bg-red-100 text-red-800',
  due_soon:  'bg-amber-100 text-amber-800',
  on_track:  'bg-green-100 text-green-800',
  fulfilled: 'bg-indigo-100 text-indigo-800',
  cancelled: 'bg-gray-100 text-gray-600',
  defaulted: 'bg-gray-100 text-gray-600',
  written_off: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  overdue: 'Overdue', due_soon: 'Due Soon', on_track: 'On Track',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled', defaulted: 'Defaulted', written_off: 'Written Off',
};

function fmt(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
  return '$' + n.toLocaleString();
}

const FILTERS = [
  { label: 'All',       value: 'all' },
  { label: 'Active',    value: 'active' },
  { label: 'Overdue',   value: 'overdue' },
  { label: 'Due Soon',  value: 'due_soon' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Cancelled', value: 'cancelled' },
];

interface Props { orgId: string; }

export default function PledgePipelineDashboard({ orgId }: Props) {
  const [filter, setFilter]         = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected]     = useState<string | null>(null);

  const apiUrl = filter === 'overdue' || filter === 'due_soon'
    ? `/api/org/${orgId}/pledges?status=all&pipeline_status=${filter}`
    : `/api/org/${orgId}/pledges?status=${filter}`;

  const { data, isLoading, mutate } = useSWR(apiUrl, fetcher, { revalidateOnFocus: false });

  const kpis = data?.kpis ?? {};
  const pledges: any[] = data?.pledges ?? [];
  const attention = data?.attention ?? { overdue: [], dueSoon: [] };

  const onCreated = useCallback(() => { setShowCreate(false); mutate(); }, [mutate]);
  const onInstallmentChange = useCallback(() => { mutate(); }, [mutate]);

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Committed',   value: fmt(kpis.committed  ?? 0), color: 'text-neutral-900' },
          { label: 'Received',    value: fmt(kpis.received   ?? 0), color: 'text-green-700' },
          { label: 'Outstanding', value: fmt(kpis.outstanding?? 0), color: 'text-neutral-900' },
          { label: 'Overdue',     value: fmt(kpis.overdue    ?? 0), color: (kpis.overdue ?? 0) > 0 ? 'text-red-700' : 'text-neutral-900' },
          { label: 'Fulfilled %', value: (kpis.fulfillmentRate ?? 0) + '%', color: 'text-neutral-900' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-neutral-200 rounded-lg px-4 py-3">
            <div className="text-xs text-neutral-500 uppercase tracking-wide">{k.label}</div>
            <div className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Attention + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
        {/* Left: Needs Attention */}
        <div className="space-y-4">
          {attention.overdue.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">⚠ Overdue</div>
              <div className="bg-white border border-red-200 rounded-lg divide-y divide-red-100 overflow-hidden">
                {attention.overdue.map((p: any) => (
                  <button key={p.id} onClick={() => setSelected(p.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-red-50 transition-colors">
                    <div className="text-xs font-semibold text-neutral-900 truncate">{p.donor_name}</div>
                    <div className="text-xs text-red-600 mt-0.5">{fmt(p.overdue)} overdue · was {p.next_due_date ?? '—'}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {attention.dueSoon.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">↑ Due Soon</div>
              <div className="bg-white border border-amber-200 rounded-lg divide-y divide-amber-100 overflow-hidden">
                {attention.dueSoon.map((p: any) => (
                  <button key={p.id} onClick={() => setSelected(p.id)}
                    className="w-full text-left px-3 py-2.5 hover:bg-amber-50 transition-colors">
                    <div className="text-xs font-semibold text-neutral-900 truncate">{p.donor_name}</div>
                    <div className="text-xs text-amber-700 mt-0.5">{fmt(p.next_due_amount ?? 0)} due {p.next_due_date}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {attention.overdue.length === 0 && attention.dueSoon.length === 0 && (
            <div className="bg-white border border-neutral-200 rounded-lg px-4 py-6 text-center">
              <div className="text-sm text-neutral-400">No items need attention</div>
            </div>
          )}
        </div>

        {/* Right: Pledge table */}
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap flex-1">
              {FILTERS.map(f => (
                <button key={f.value} onClick={() => setFilter(f.value)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === f.value ? 'bg-azure text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-md hover:bg-azure/90 transition-colors whitespace-nowrap">
              + New Pledge
            </button>
          </div>

          {isLoading ? (
            <div className="px-4 py-10 text-center text-neutral-400 text-sm">Loading…</div>
          ) : pledges.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-neutral-400 text-sm mb-3">No pledges found</div>
              <button onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm font-medium bg-azure text-white rounded-md hover:bg-azure/90">
                Create first pledge
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className="bg-neutral-50">
                  <tr>
                    {['Donor','Pledged','Received','Outstanding','Next Due','Status',''].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {pledges.map((p: any) => (
                    <tr key={p.id} className="hover:bg-neutral-50 cursor-pointer" onClick={() => setSelected(p.id)}>
                      <td className="px-4 py-3 font-medium text-neutral-900 truncate max-w-[160px]">{p.donor_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{fmt(p.total_amount)}</td>
                      <td className="px-4 py-3 text-green-700">{fmt(p.received)}</td>
                      <td className="px-4 py-3 text-neutral-700">{fmt(p.outstanding)}</td>
                      <td className="px-4 py-3 text-neutral-600">{p.next_due_date ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[p.pipeline_status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[p.pipeline_status] ?? p.pipeline_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-xs text-azure hover:underline" onClick={e => { e.stopPropagation(); setSelected(p.id); }}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <PledgeCreateModal orgId={orgId} onClose={() => setShowCreate(false)} onCreated={onCreated} />
      )}
      {selected && (
        <PledgeDetailPanel orgId={orgId} pledgeId={selected} onClose={() => setSelected(null)} onChanged={onInstallmentChange} />
      )}
    </div>
  );
}
