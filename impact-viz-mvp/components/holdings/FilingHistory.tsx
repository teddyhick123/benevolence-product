interface Filing {
  tax_year?: number;
  tax_period?: string;
  total_revenue?: number;
  total_expenses?: number;
  total_assets?: number;
  total_liabilities?: number;
  filing_url?: string;
}

function formatAmount(amount: number | undefined | null): string {
  if (amount == null) return '—';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

export default function FilingHistory({ filings }: { filings: Filing[] }) {
  if (!filings || filings.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-medium text-neutral-900 mb-2">Form 990 Filing History</h3>
        <p className="text-xs text-neutral-500">No filing history available.</p>
      </div>
    );
  }

  const sorted = [...filings].sort((a, b) => (b.tax_year || 0) - (a.tax_year || 0));

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100">
        <h3 className="text-sm font-medium text-neutral-900">Form 990 Filing History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-neutral-50 text-neutral-500">
              <th className="text-left px-4 py-2 font-medium">Year</th>
              <th className="text-right px-4 py-2 font-medium">Revenue</th>
              <th className="text-right px-4 py-2 font-medium">Expenses</th>
              <th className="text-right px-4 py-2 font-medium">Assets</th>
              <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Liabilities</th>
              <th className="text-center px-4 py-2 font-medium">Filing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((f, i) => (
              <tr key={f.tax_year || i} className="hover:bg-neutral-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-neutral-900">
                  {f.tax_year || '—'}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-700">
                  {formatAmount(f.total_revenue)}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-700">
                  {formatAmount(f.total_expenses)}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-700">
                  {formatAmount(f.total_assets)}
                </td>
                <td className="px-4 py-2.5 text-right text-neutral-700 hidden sm:table-cell">
                  {formatAmount(f.total_liabilities)}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {f.filing_url ? (
                    <a
                      href={f.filing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-azure hover:text-azure/80 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View
                    </a>
                  ) : (
                    <span className="text-neutral-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
