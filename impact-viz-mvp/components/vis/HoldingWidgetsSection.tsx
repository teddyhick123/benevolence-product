'use client';

import * as React from 'react';
import useSWR from 'swr';
import VisualCarousel from '@/components/vis/VisualCarousel';
import CreateWidgetModal from '@/components/vis/CreateWidgetModal';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

type WidgetRow = {
  id: string;
  holding_id: string;
  type: string;
  title: string | null;
  config: any | null;
  position: number | null;
};

export default function HoldingWidgetsSection({
  holdingId,
  portfolioId,
  canEdit = false
}: {
  holdingId: string;
  portfolioId: string;
  canEdit?: boolean;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ data: WidgetRow[] }>(
    `/api/holdings/${encodeURIComponent(holdingId)}/widgets`,
    fetcher
  );

  const items = React.useMemo(() => {
    const arr = (data?.data ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return arr.map(w => ({ id: w.id, label: w.title ?? w.type, type: w.type as any, title: w.title, config: w.config || {} }));
  }, [data]);

  const [open, setOpen] = React.useState(false);
  const onChanged = () => mutate();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
        <p className="font-medium mb-1">Loading widgets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
        <p className="font-medium mb-1">Error loading widgets</p>
        <p className="text-xs">{error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          <p className="font-medium mb-1">No visualizations</p>
          <p className="text-xs mb-3">Add charts and graphs specific to this holding</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Add Widget
            </button>
          )}
        </div>
        <CreateWidgetModal
          portfolioId={portfolioId}
          holdingId={holdingId}
          open={open}
          onClose={() => setOpen(false)}
          onCreated={onChanged}
        />
      </>
    );
  }

  return (
    <>
      <div className="w-full h-full">
        <VisualCarousel
          items={items as any}
          portfolioId={portfolioId}
          canEdit={canEdit}
          onEdit={() => setOpen(true)}
        />
      </div>
      <CreateWidgetModal
        portfolioId={portfolioId}
        holdingId={holdingId}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={onChanged}
      />
    </>
  );
}
