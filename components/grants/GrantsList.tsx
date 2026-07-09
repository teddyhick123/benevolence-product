'use client';

import useSWR from 'swr';
import GrantSummaryCard, { type Grant } from '@/components/grants/GrantSummaryCard';
import SectionHeader from '@/components/ui/SectionHeader';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(r => r.json());

interface GrantsResponse {
  data: Grant[];
  count: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-black/5 bg-white shadow-sm p-4 animate-pulse space-y-2">
      <div className="flex justify-between">
        <div className="h-4 w-40 bg-neutral-200 rounded" />
        <div className="h-4 w-16 bg-neutral-100 rounded-full" />
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-24 bg-neutral-100 rounded" />
        <div className="h-3 w-20 bg-neutral-100 rounded" />
      </div>
    </div>
  );
}

export default function GrantsList({ portfolioId, orgId }: { portfolioId: string; orgId?: string | null }) {
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant.singular;
  const grantPlural = vocabulary.grant.plural;
  const { data, error, isLoading } = useSWR<GrantsResponse>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/grants?limit=50`,
    fetcher
  );

  const grants = data?.data ?? [];

  return (
    <section className="space-y-4">
      <SectionHeader title={grantPlural} subtitle={`Portfolio ${grantLabel.toLowerCase()} activity`} />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 p-6 text-sm">
          Failed to load {grantPlural.toLowerCase()}
        </div>
      ) : grants.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500 text-center">
          No {grantPlural.toLowerCase()} found for this portfolio.
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {grants.map(grant => (
            <GrantSummaryCard key={grant.id} grant={grant} grantLabel={grantLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
