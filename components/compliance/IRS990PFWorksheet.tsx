'use client';

import { useState, useEffect } from 'react';

interface GrantDetail {
  id: string;
  date: string;
  recipient: string;
  recipient_ein: string | null;
  recipient_type: string | null;
  amount: number;
  deductible_amount: number;
  type: string;
  description: string | null;
}

interface WorksheetData {
  portfolio: { id: string; name: string };
  tax_year: number;
  part_xi: {
    fair_market_value_assets: number | null;
    required_payout: number | null;
    actual_payout: number;
    qualifying_distributions_total: number;
  };
  part_xii: {
    grants_count: number;
    grants_total: number;
    qualifying_distributions_total: number;
    grants_detail: GrantDetail[];
  };
}

interface Props {
  portfolioId: string;
  year?: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export default function IRS990PFWorksheet({ portfolioId, year }: Props) {
  const defaultYear = new Date().getFullYear() - 1;
  const [selectedYear, setSelectedYear] = useState(year ?? defaultYear);
  const [data, setData] = useState<WorksheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/portfolio/${portfolioId}/compliance/990pf-export?year=${selectedYear}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setData(d);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portfolioId, selectedYear]);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Form 990-PF — Part XIII: Qualifying Distributions
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Distributions for charitable purposes</p>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>
              Tax Year {y}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 py-8 text-center">Loading worksheet...</div>
      )}

      {error && <div className="text-sm text-red-600 py-4">{error}</div>}

      {data && !loading && (
        <>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-left py-2 pr-4">Recipient</th>
                  <th className="text-left py-2 pr-4">EIN</th>
                  <th className="text-left py-2 pr-4">Type</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.part_xii.grants_detail.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400 text-sm">
                      No qualifying distributions recorded for {selectedYear}
                    </td>
                  </tr>
                )}
                {data.part_xii.grants_detail.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                      {new Date(g.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2 pr-4 font-medium text-gray-800">{g.recipient}</td>
                    <td className="py-2 pr-4 text-gray-500 font-mono text-xs">
                      {g.recipient_ein ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-gray-500 capitalize">
                      {g.type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 text-right font-medium text-gray-900">
                      {fmt(g.deductible_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={4} className="py-2 pr-4 text-sm font-semibold text-gray-700">
                    Total Qualifying Distributions ({data.part_xii.grants_count} grants)
                  </td>
                  <td className="py-2 text-right font-bold text-gray-900">
                    {fmt(data.part_xii.qualifying_distributions_total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              5% Minimum Distribution Requirement
            </p>
            {data.part_xi.required_payout !== null ? (
              <div className="flex flex-wrap items-start gap-6">
                <div>
                  <p className="text-xs text-gray-500">Required (5% of FMV assets)</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {fmt(data.part_xi.required_payout)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Actual qualifying distributions</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {fmt(data.part_xi.qualifying_distributions_total)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span
                    className={`inline-flex items-center text-sm font-semibold mt-0.5 ${
                      data.part_xi.qualifying_distributions_total >= data.part_xi.required_payout!
                        ? 'text-green-700'
                        : 'text-red-700'
                    }`}
                  >
                    {data.part_xi.qualifying_distributions_total >= data.part_xi.required_payout!
                      ? 'Minimum distribution met'
                      : 'Below minimum distribution requirement'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Enter fair market value of assets in foundation data to calculate the 5% minimum.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
