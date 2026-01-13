

'use client';

import * as React from 'react';
import useSWR from 'swr';
import SectionHeader from '@/components/SectionHeader';
import HoldingsTable from '@/components/HoldingsTable';
import EditHoldingsModal, { HoldingInput } from '@/components/EditHoldingsModal';
import { AssetType } from '@/lib/schemas/portfolio';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

export type HoldingRow = any;

export default function HoldingsSection({ portfolioId, canEdit = false }: { portfolioId: string; canEdit?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: HoldingRow[]; count: number; nextOffset: number | null }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/holdings?limit=100`,
    fetcher
  );

  const rows = data?.data ?? [];
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HoldingInput | null>(null);
  const [selectedAssetType, setSelectedAssetType] = React.useState<AssetType | 'all'>('all');

  // Filter rows by asset type
  const filteredRows = React.useMemo(() => {
    if (selectedAssetType === 'all') {
      return rows;
    }
    return rows.filter((row: any) => row.asset_type === selectedAssetType);
  }, [rows, selectedAssetType]);

  // Calculate counts for filter
  const assetTypeCounts = React.useMemo(() => {
    const counts: Partial<Record<AssetType | 'all', number>> = {
      all: rows.length,
    };
    rows.forEach((row: any) => {
      const assetType = row.asset_type as AssetType;
      if (assetType) {
        counts[assetType] = (counts[assetType] || 0) + 1;
      }
    });
    return counts;
  }, [rows]);

  const onAdd = () => { setEditing(null); setOpen(true); };
  const onEditRow = (row: any) => {
    if (!row) { onAdd(); return; }
    setEditing({
      id: row.id,
      name: row.name ?? row.holding_name,
      asset_type: row.asset_type,
      funds_allocated: row.funds ?? row.funds_allocated ?? row.nav ?? null,
      status: row.status,
      as_of: row.asOfRaw ?? row.as_of ?? row.as_of_date ?? null,
      sector: row.sector ?? null,
      country: row.country ?? null,
    });
    setOpen(true);
  };

  const onChanged = () => mutate();

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Holdings"
        subtitle="Click for details"
        canEdit={canEdit}
        onEdit={onAdd}
        editLabel="Add holding"
      />

      {/* Scrollable container with fixed height matching widgets carousel (500px) */}
      {isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500 h-[500px] flex items-center justify-center">
          Loading holdings…
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 p-6 text-sm h-[500px] flex items-center justify-center">
          {(error as any)?.message || 'Failed to load holdings'}
        </div>
      ) : (
        <div className="h-[500px] overflow-y-auto overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-soft">
          <HoldingsTable
            rows={filteredRows as any}
            canEdit={canEdit}
            onEditRow={onEditRow}
            selectedAssetType={selectedAssetType}
            onAssetTypeChange={setSelectedAssetType}
            assetTypeCounts={assetTypeCounts}
            totalCount={rows.length}
          />
        </div>
      )}

      <EditHoldingsModal
        portfolioId={portfolioId}
        initial={editing}
        open={open}
        onClose={() => setOpen(false)}
        onChanged={onChanged}
      />
    </section>
  );
}