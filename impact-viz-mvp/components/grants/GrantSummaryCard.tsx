'use client';

export interface Grant {
  id: string;
  name: string;
  grant_type?: string | null;
  grantee_name?: string | null;
  amount?: number | null;
  funds_allocated?: number | null;
  grant_period_status?: string | null;
  renewal_eligible?: boolean | null;
  sector?: string | null;
  country?: string | null;
  grant_start_date?: string | null;
  grant_end_date?: string | null;
}

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-50 text-yellow-700',
};

export default function GrantSummaryCard({ grant }: { grant: Grant }) {
  const status = grant.grant_period_status ?? 'active';
  const value = grant.funds_allocated ?? grant.amount;

  return (
    <div className="rounded-xl border border-black/5 bg-white shadow-sm p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm text-neutral-900 truncate">{grant.name}</p>
          {grant.grantee_name && (
            <p className="text-xs text-neutral-500 truncate">{grant.grantee_name}</p>
          )}
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}
        >
          {status}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span>{grant.grant_type ?? 'Grant'}</span>
        <span className="font-semibold text-neutral-800">{formatCurrency(value)}</span>
      </div>

      {(grant.sector || grant.country) && (
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          {grant.sector && <span>{grant.sector}</span>}
          {grant.sector && grant.country && <span>·</span>}
          {grant.country && <span>{grant.country}</span>}
        </div>
      )}

      {grant.renewal_eligible && (
        <div className="text-xs text-azure font-medium">Renewal eligible</div>
      )}
    </div>
  );
}
