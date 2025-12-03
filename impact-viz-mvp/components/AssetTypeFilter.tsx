'use client';

import React from 'react';
import { AssetType, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, getAssetTypeColor } from '@/lib/schemas/portfolio';

type Props = {
  value: AssetType | 'all';
  onChange: (value: AssetType | 'all') => void;
  counts?: Partial<Record<AssetType | 'all', number>>;
  className?: string;
};

export default function AssetTypeFilter({ value, onChange, counts, className = '' }: Props) {
  const assetTypes: Array<{ value: AssetType | 'all'; label: string }> = [
    { value: 'all', label: 'All Assets' },
    { value: 'equity_investment', label: ASSET_TYPE_LABELS.equity_investment },
    { value: 'debt_investment', label: ASSET_TYPE_LABELS.debt_investment },
    { value: 'pri', label: ASSET_TYPE_LABELS.pri },
    { value: 'mri', label: ASSET_TYPE_LABELS.mri },
    { value: 'foundation_grant', label: ASSET_TYPE_LABELS.foundation_grant },
    { value: 'daf_grant', label: ASSET_TYPE_LABELS.daf_grant },
    { value: 'donation', label: ASSET_TYPE_LABELS.donation },
    { value: 'other', label: ASSET_TYPE_LABELS.other },
  ];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <label htmlFor="asset-type-filter" className="text-sm font-medium text-neutral-700 shrink-0">
        Filter by type:
      </label>
      <select
        id="asset-type-filter"
        value={value}
        onChange={(e) => onChange(e.target.value as AssetType | 'all')}
        className="
          block w-full sm:w-auto min-w-[180px]
          rounded-lg border border-black/10
          bg-white px-3 py-2
          text-sm text-neutral-900
          shadow-sm
          focus:border-azure focus:outline-none focus:ring-2 focus:ring-azure/20
          transition-all duration-200
        "
      >
        {assetTypes.map((type) => {
          const count = counts?.[type.value];
          const displayLabel = count !== undefined ? `${type.label} (${count})` : type.label;

          return (
            <option key={type.value} value={type.value}>
              {displayLabel}
            </option>
          );
        })}
      </select>
    </div>
  );
}

// Note: ASSET_TYPE_COLORS and getAssetTypeColor are now exported from @/lib/schemas/portfolio
// for consistency across all components and visualizations
