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
