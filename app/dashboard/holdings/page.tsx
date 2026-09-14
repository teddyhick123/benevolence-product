'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import { useHoldingsData } from "@/lib/holdings/hooks";

import { useState, useEffect } from 'react';
import HoldingsTable from '@/components/holdings/HoldingsTable';
import EditHoldingsModal, { HoldingInput } from '@/components/holdings/EditHoldingsModal';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { AssetType } from '@/lib/schemas/portfolio';


export default function HoldingsPage() {
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingInput | null>(null);

  useEffect(() => {
    apiRequest('/api/me', { cache: 'no-store' })
      .then(r => readJson(r))
      .then(me => {
        if (me?.recommended_portfolio_id) setPortfolioId(me.recommended_portfolio_id);
        if (me?.role === 'owner' || me?.role === 'admin' || me?.role === 'member') setCanEdit(true);
      })
      .catch(() => {});
  }, []);

  const { data, isLoading, mutate } = useHoldingsData<{ data: any[]; count: number; nextOffset: number | null }>(
    portfolioId ? `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings?limit=200` : null);

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
    <div className="space-y-6 p-6">
      <PageHeader
        title="Holdings"
        description={isLoading ? 'Loading holdings…' : `${rows.length} holding${rows.length !== 1 ? 's' : ''} in this portfolio`}
        actions={
          <>
          {rows.length > 0 && (
            <Button
              onClick={exportCsv}
              variant="secondary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </Button>
          )}
          {canEdit && (
            <Button
              onClick={onAdd}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Holding
            </Button>
          )}
          </>
        }
      />

      {isLoading ? (
        <Card className="flex items-center justify-center p-12 text-sm text-ink/60">
          Loading holdings…
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No holdings yet"
          description="Add an investment or grant to start tracking this portfolio."
          action={canEdit ? (
            <Button
              onClick={onAdd}
            >
              Add your first holding
            </Button>
          ) : undefined}
        />
      ) : (
        <Card padding="none" className="overflow-hidden">
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
        </Card>
      )}

      {portfolioId && (
        <EditHoldingsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onChanged={() => mutate()}
          portfolioId={portfolioId}
          initial={editing ?? undefined}
        />
      )}
    </div>
  );
}
