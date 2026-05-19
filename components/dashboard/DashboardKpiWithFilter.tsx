'use client';

import { useState } from 'react';
import KpiSection from '@/components/dashboard/KpiSection';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [
  { label: 'All time', value: '' },
  ...Array.from({ length: 5 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { label: String(y), value: `${y}-12-31` };
  }),
];

interface Props {
  portfolioId: string;
  canEdit: boolean;
  initialSums?: Array<{ metric_code: string; total_value: number | null; latest_period: string | null }>;
}

export default function DashboardKpiWithFilter({ portfolioId, canEdit, initialSums }: Props) {
  const [asOf, setAsOf] = useState('');

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <label className="text-xs text-neutral-500 mr-2">Fiscal year</label>
        <select
          value={asOf}
          onChange={e => setAsOf(e.target.value)}
          className="text-xs border border-neutral-200 rounded-md px-2 py-1 bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-azure"
        >
          {YEAR_OPTIONS.map(opt => (
            <option key={opt.label} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <KpiSection
        portfolioId={portfolioId}
        canEdit={canEdit}
        initialSums={asOf ? undefined : initialSums}
        mode={asOf ? 'raw' : 'portfolio-sum'}
        asOf={asOf || undefined}
      />
    </div>
  );
}
