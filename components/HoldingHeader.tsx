'use client';

import InlineEdit from './ui/InlineEdit';
import AddToTaxTrackerButton from './AddToTaxTrackerButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type HoldingHeaderProps = {
  holdingId: string;
  portfolioId: string;
  name: string;
  assetClass?: string | null;
  sector?: string | null;
  location?: string | null;
  status?: string | null;
  asOf?: string | null;
  funds?: number;
  contributionCount?: number;
  isManualFunds?: boolean;
  grantPeriodStatus?: 'Active' | 'Expired' | 'Pipeline' | null;
};

function humanDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function HoldingHeader({
  holdingId,
  portfolioId,
  name,
  assetClass,
  sector,
  location,
  status,
  asOf,
  funds,
  contributionCount,
  isManualFunds,
  grantPeriodStatus,
}: HoldingHeaderProps) {
  const router = useRouter();

  const updateField = async (fieldName: string, value: string) => {
    const formData = new FormData();
    formData.append('holding_id', holdingId);
    formData.append(fieldName, value);

    const response = await fetch(`/api/holdings/${holdingId}/update-basic`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to update');
    }

    router.refresh();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs text-neutral-500">Holding</p>
          <InlineEdit
            value={name}
            onSave={(newValue) => updateField('name', newValue)}
            className="text-2xl font-semibold text-neutral-900"
            as="h1"
          />
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Link
            href={`/dashboard/letter?portfolio_id=${portfolioId}&holding_id=${holdingId}`}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Report
          </Link>
          <AddToTaxTrackerButton
            holdingId={holdingId}
            holdingName={name}
            portfolioId={portfolioId}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
      {funds != null && isFinite(funds) && (
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-neutral-500">Funds allocated:</span>
          <span className="text-sm font-semibold text-neutral-900">
            {formatCurrency(funds)}
          </span>
        </div>
      )}
      {contributionCount != null && contributionCount > 0 && (
        <p className="text-xs text-neutral-500">
          {contributionCount} contribution{contributionCount !== 1 ? 's' : ''}
        </p>
      )}
      {isManualFunds && (
        <p className="text-xs text-neutral-500">Manual funding entry</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-700">
        {assetClass && (
          <span>
            Class:{' '}
            <InlineEdit
              value={assetClass}
              onSave={(newValue) => updateField('asset_type', newValue)}
              className="font-medium"
            />
          </span>
        )}
        {sector && (
          <span>
            Sector:{' '}
            <InlineEdit
              value={sector}
              onSave={(newValue) => updateField('sector', newValue)}
              className="font-medium"
            />
          </span>
        )}
        {location && <span>Location: <span className="font-medium">{location}</span></span>}
        {status && (
          <span>
            Status:{' '}
            <InlineEdit
              value={status}
              onSave={(newValue) => updateField('status', newValue)}
              className="font-medium"
            />
          </span>
        )}
        {asOf && <span>As of: <span className="font-medium">{humanDate(asOf)}</span></span>}
        {grantPeriodStatus && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
            grantPeriodStatus === 'Active' ? 'bg-green-100 text-green-800' :
            grantPeriodStatus === 'Expired' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {grantPeriodStatus}
          </span>
        )}
      </div>
      </div>
    </header>
  );
}