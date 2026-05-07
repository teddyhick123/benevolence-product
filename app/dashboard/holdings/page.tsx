'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import HoldingsTable from '@/components/HoldingsTable';
import EditHoldingsModal, { HoldingInput } from '@/components/EditHoldingsModal';
import { AssetType } from '@/lib/schemas/portfolio';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export default function HoldingsPage() {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingInput | null>(null);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(me => {
        if (me?.recommended_portfolio_id) setPortfolioId(me.recommended_portfolio_id);
        if (me?.role === 'owner' || me?.role === 'admin' || me?.role === 'member') setCanEdit(true);
      })
      .catch(() => {});
  }, []);

  const { data, isLoading, mutate } = useSWR<{ data: any[]; count: number; nextOffset: number | null }>(
    portfolioId ? `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings?limit=200` : null,
    fetcher
  );

  const rows = data?.data ?? [];

  const filteredRows = selectedAssetType === 'all'
    ? rows
    : rows.filter((r: any) => r.asset_type === selectedAssetType);

  const assetTypeCounts: Partial<Record<AssetType | 'all', number>> = { all: rows.length };
  rows.forEach((r: any) => {
    if (r.asset_type) assetTypeCounts[r.asset_type as AssetType] = (assetTypeCounts[r.asset_type as AssetType] || 0) + 1;
  });

  const onAdd = () => { setEditing(null); setModalOpen(true); };

  const exportCsv = () => {
    const headers = ['Name', 'Asset Type', 'Sector', 'Status', 'Funds Allocated', 'As Of'];
    const csvRows = [
      headers.join(','),
      ...filteredRows.map(r => [
        JSON.stringify(r.name ?? r.holding_name ?? ''),
        JSON.stringify(r.asset_type ?? ''),
        JSON.stringify(r.sector ?? ''),
        JSON.stringify(r.status ?? ''),
        r.funds ?? r.funds_allocated ?? '',
        r.asOfRaw ?? r.as_of ?? '',
      ].join(',')),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `holdings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onEditRow = (row: any) => {
    setEditing({
      id: row.id,
      name: row.name ?? row.holding_name,
      asset_type: row.asset_type,
      funds_allocated: row.funds ?? row.funds_allocated ?? null,
      status: row.status,
      as_of: row.asOfRaw ?? row.as_of ?? null,
      sector: row.sector ?? null,
      country: row.country ?? null,
    });
    setModalOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Holdings</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isLoading ? 'Loading…' : `${rows.length} holding${rows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </button>
          )}
          {canEdit && (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Holding
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-12 text-sm text-neutral-500 flex items-center justify-center">
          Loading holdings…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-12 text-center">
          <div className="text-gray-400 text-sm">No holdings yet.</div>
          {canEdit && (
            <button
              onClick={onAdd}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-colors"
            >
              Add your first holding
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft overflow-hidden">
          <HoldingsTable
            rows={filteredRows}
            canEdit={canEdit}
            onEditRow={onEditRow}
            portfolioId={portfolioId ?? undefined}
            selectedAssetType={selectedAssetType}
            onAssetTypeChange={setSelectedAssetType}
            assetTypeCounts={assetTypeCounts}
            totalCount={rows.length}
          />
        </div>
      )}

      {portfolioId && (
        <EditHoldingsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onChanged={() => mutate()}
          portfolioId={portfolioId}
          initialData={editing ?? undefined}
        />
      )}
    </div>
  );
}
