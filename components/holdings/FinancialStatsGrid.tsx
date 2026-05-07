interface FinancialStatsGridProps {
  annualRevenue?: number | null;
  annualExpenses?: number | null;
  totalAssets?: number | null;
  programExpenseRatio?: number | null;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'N/A';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function getRatioColor(ratio: number | null | undefined): string {
  if (ratio == null) return 'text-neutral-400';
  if (ratio >= 0.75) return 'text-emerald-600';
  if (ratio >= 0.50) return 'text-amber-600';
  return 'text-red-600';
}

function getRatioBg(ratio: number | null | undefined): string {
  if (ratio == null) return 'bg-neutral-50';
  if (ratio >= 0.75) return 'bg-emerald-50';
  if (ratio >= 0.50) return 'bg-amber-50';
  return 'bg-red-50';
}

export default function FinancialStatsGrid({
  annualRevenue,
  annualExpenses,
  totalAssets,
  programExpenseRatio,
}: FinancialStatsGridProps) {
  const stats = [
    {
      label: 'Annual Revenue',
      value: formatCurrency(annualRevenue),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-50',
    },
    {
      label: 'Annual Expenses',
      value: formatCurrency(annualExpenses),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
      ),
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-50',
    },
    {
      label: 'Total Assets',
      value: formatCurrency(totalAssets),
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      iconColor: 'text-purple-500',
      iconBg: 'bg-purple-50',
    },
    {
      label: 'Program Expense Ratio',
      value: programExpenseRatio != null
        ? `${(programExpenseRatio * 100).toFixed(0)}%`
        : 'N/A',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      iconColor: getRatioColor(programExpenseRatio),
      iconBg: getRatioBg(programExpenseRatio),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-neutral-200 bg-white p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${stat.iconBg}`}>
              <span className={stat.iconColor}>{stat.icon}</span>
            </div>
          </div>
          <p className="text-lg font-semibold text-neutral-900">{stat.value}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
