

'use client';

import * as React from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import SectionHeader from '@/components/ui/SectionHeader';
import VisualCarousel from '@/components/vis/VisualCarousel';

// Lazy load modal to reduce initial bundle size
const EditWidgetsModal = dynamic(() => import('@/components/vis/EditWidgetsModal'), {
  loading: () => null,
  ssr: false,
});

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

type WidgetRow = {
  id: string;
  portfolio_id: string;
  type: string;
  title: string | null;
  config: any | null;
  position: number | null;
};

export default function WidgetsSection({ portfolioId, canEdit = false }: { portfolioId: string; canEdit?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: WidgetRow[] }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/widgets`,
    fetcher
  );

  const items = React.useMemo(() => {
    const arr = (data?.data ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return arr.map(w => ({ id: w.id, label: w.title ?? w.type, type: w.type as any, title: w.title, config: w.config || {} }));
  }, [data]);

  const [open, setOpen] = React.useState(false);
  const onChanged = () => mutate();

  return (
    <section className="w-full min-w-0 space-y-4">
      <SectionHeader
        title="Visualizations"
        subtitle="Customizable widgets via D3"
        canEdit={canEdit}
        onEdit={() => setOpen(true)}
        editLabel="Edit widgets"
      />

      {isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500">Loading widgets…</div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 p-6 text-sm">{(error as any)?.message || 'Failed to load widgets'}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-600">
          No widgets configured.
          {canEdit ? (
            <div className="mt-3">
              <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-2xl border border-black/10 bg-white text-neutral-900 shadow-sm hover:shadow px-3 py-1.5">Add widget</button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="w-full h-full">
          <VisualCarousel
            items={items as any}
            portfolioId={portfolioId}
            canEdit={canEdit}
            onEdit={() => setOpen(true)}
          />
        </div>
      )}

      <EditWidgetsModal portfolioId={portfolioId} open={open} onClose={() => setOpen(false)} onChanged={onChanged} />
    </section>
  );
}