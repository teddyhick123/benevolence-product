'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  TAX_DISCLAIMER,
  CONTRIBUTION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
} from '@/lib/tax/constants';

interface ExportData {
  meta: {
    portfolioName: string;
    taxYear: number;
    generatedAt: string;
    disclaimer: string;
  };
  profile: {
    filingStatus: string;
    estimatedAGI: number | null;
    carryforwardFromPrior: number | null;
  } | null;
  summary: {
    totalContributions: number;
    totalDeductible: number;
    cashContributions: number;
    nonCashContributions: number;
    contributionCount: number;
    compliantCount: number;
    complianceRate: number | null;
    totalCarryforwardAvailable: number;
  };
  contributions: Array<{
    date: string;
    recipient: string;
    recipientEIN: string;
    recipientType: string;
    type: string;
    amount: number;
    deductibleAmount: number;
    fmv: number | null;
    costBasis: number | null;
    acknowledgmentReceived: string;
    isCompliant: string;
    substantiationRequired: string;
    notes: string;
  }>;
  carryforwards: Array<{
    originatingYear: number;
    expiresYear: number;
    category: string;
    originalAmount: number;
    remainingAmount: number;
    recipient: string;
  }>;
}

function PrintContent() {
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get('portfolioId');
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!portfolioId) {
        setError('Portfolio ID required');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/portfolio/${portfolioId}/tax/export?year=${year}&format=json`
        );

        if (!res.ok) {
          throw new Error('Failed to load tax data');
        }

        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [portfolioId, year]);

  useEffect(() => {
    // Auto-trigger print dialog when data loads
    if (data && !loading) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [data, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-azure mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading tax summary...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error || 'Failed to load data'}</p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 bg-neutral-600 text-white rounded-2xl"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 print:p-4">
      {/* Print Button (hidden when printing) */}
      <div className="print:hidden mb-6 flex justify-end gap-3">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-azure text-white rounded-2xl hover:opacity-90"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50"
        >
          Close
        </button>
      </div>

      {/* Header */}
      <div className="border-b-2 border-ink pb-4 mb-6">
        <h1 className="text-3xl font-bold text-ink">
          Charitable Contribution Summary
        </h1>
        <div className="mt-2 text-lg text-neutral-700">
          Tax Year {data.meta.taxYear}
        </div>
        <div className="mt-1 text-sm text-neutral-600">
          {data.meta.portfolioName}
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          Generated: {new Date(data.meta.generatedAt).toLocaleString()}
        </div>
      </div>

      {/* Summary Section */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-ink mb-4 border-b border-black/10 pb-2">
          Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-neutral-50 p-4 rounded-2xl">
            <div className="text-sm text-neutral-600">Total Contributions</div>
            <div className="text-2xl font-bold text-ink">
              ${data.summary.totalContributions.toLocaleString()}
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-2xl">
            <div className="text-sm text-neutral-600">Total Deductible</div>
            <div className="text-2xl font-bold text-ink">
              ${data.summary.totalDeductible.toLocaleString()}
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-2xl">
            <div className="text-sm text-neutral-600">Cash Contributions</div>
            <div className="text-2xl font-bold text-ink">
              ${data.summary.cashContributions.toLocaleString()}
            </div>
          </div>
          <div className="bg-neutral-50 p-4 rounded-2xl">
            <div className="text-sm text-neutral-600">Non-Cash Contributions</div>
            <div className="text-2xl font-bold text-ink">
              ${data.summary.nonCashContributions.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-neutral-600">Number of Contributions:</span>{' '}
            <span className="font-semibold">{data.summary.contributionCount}</span>
          </div>
          <div>
            <span className="text-neutral-600">Documentation Complete:</span>{' '}
            <span className="font-semibold">
              {data.summary.compliantCount} of {data.summary.contributionCount}{' '}
              ({data.summary.complianceRate}%)
            </span>
          </div>
          {data.summary.totalCarryforwardAvailable > 0 && (
            <div>
              <span className="text-neutral-600">Carryforward Available:</span>{' '}
              <span className="font-semibold">
                ${data.summary.totalCarryforwardAvailable.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Contributions Table */}
      <section className="mb-8">
        <h2 className="text-xl font-bold text-ink mb-4 border-b border-black/10 pb-2">
          Contributions Detail
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-100">
                <th className="text-left p-2 font-semibold">Date</th>
                <th className="text-left p-2 font-semibold">Recipient</th>
                <th className="text-left p-2 font-semibold">EIN</th>
                <th className="text-left p-2 font-semibold">Type</th>
                <th className="text-right p-2 font-semibold">Amount</th>
                <th className="text-right p-2 font-semibold">Deductible</th>
                <th className="text-center p-2 font-semibold">Ack.</th>
              </tr>
            </thead>
            <tbody>
              {data.contributions.map((c, idx) => (
                <tr key={idx} className="border-b border-black/5">
                  <td className="p-2">{new Date(c.date).toLocaleDateString()}</td>
                  <td className="p-2">{c.recipient}</td>
                  <td className="p-2 font-mono text-xs">{c.recipientEIN || '-'}</td>
                  <td className="p-2">{c.type}</td>
                  <td className="p-2 text-right">${c.amount.toLocaleString()}</td>
                  <td className="p-2 text-right">${c.deductibleAmount.toLocaleString()}</td>
                  <td className="p-2 text-center">
                    {c.acknowledgmentReceived === 'Yes' ? 'Yes' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 font-semibold">
                <td colSpan={4} className="p-2">Total</td>
                <td className="p-2 text-right">
                  ${data.summary.totalContributions.toLocaleString()}
                </td>
                <td className="p-2 text-right">
                  ${data.summary.totalDeductible.toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Carryforwards */}
      {data.carryforwards.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold text-ink mb-4 border-b border-black/10 pb-2">
            Carryforwards
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-100">
                <th className="text-left p-2 font-semibold">From Year</th>
                <th className="text-left p-2 font-semibold">Expires</th>
                <th className="text-left p-2 font-semibold">Category</th>
                <th className="text-right p-2 font-semibold">Original</th>
                <th className="text-right p-2 font-semibold">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {data.carryforwards.map((cf, idx) => (
                <tr key={idx} className="border-b border-black/5">
                  <td className="p-2">{cf.originatingYear}</td>
                  <td className="p-2">{cf.expiresYear}</td>
                  <td className="p-2">{cf.category}</td>
                  <td className="p-2 text-right">${cf.originalAmount.toLocaleString()}</td>
                  <td className="p-2 text-right">${cf.remainingAmount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Disclaimer */}
      <section className="mt-8 pt-4 border-t border-black/10">
        <h2 className="text-sm font-bold text-neutral-700 mb-2">Important Disclaimer</h2>
        <p className="text-xs text-neutral-600 whitespace-pre-line">{TAX_DISCLAIMER}</p>
      </section>

      {/* Page break for additional notes */}
      <div className="print:break-before-page"></div>
    </div>
  );
}

export default function TaxPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PrintContent />
    </Suspense>
  );
}
