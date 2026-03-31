'use client';
// app/admin/imports/ImportDashboardClient.tsx
// Client wrapper for the import dashboard (handles wizard modal)

import { useState } from 'react';
import Link from 'next/link';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import { NewImportWizard } from '@/components/admin/NewImportWizard';
import type { ImportJob } from '@/lib/import/types';

interface Props {
  initialJobs: ImportJob[];
  portfolios: { id: string; name: string }[];
}

export function ImportDashboardClient({ initialJobs, portfolios }: Props) {
  const [showWizard, setShowWizard] = useState(false);
  const [jobs] = useState<ImportJob[]>(initialJobs);

  const portfolioMap = Object.fromEntries(portfolios.map((p) => [p.id, p.name]));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Data Imports</h1>
        <button
          onClick={() => setShowWizard(true)}
          className="px-4 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none text-sm font-medium"
        >
          New Import
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="card p-8 text-center text-neutral-500 text-sm">
          <p className="mb-2 text-base font-medium">No imports yet</p>
          <p>
            Start by migrating data from Blackbaud, Salesforce, or another system.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Portfolio</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Progress</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">Created</th>
                <th className="text-right px-4 py-3 font-medium text-neutral-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{job.name}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {job.portfolio_id ? (portfolioMap[job.portfolio_id] ?? '—') : '—'}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 capitalize">
                    {job.source_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <ImportStatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {job.records_loaded > 0
                      ? `${job.records_loaded.toLocaleString()} / ${job.total_records_extracted.toLocaleString()} loaded`
                      : job.total_records_extracted > 0
                      ? `${job.total_records_extracted.toLocaleString()} extracted`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/imports/${job.id}`}
                        className="text-azure hover:underline text-xs"
                      >
                        View
                      </Link>
                      {job.status === 'paused' && (
                        <button className="text-yellow-700 hover:underline text-xs">
                          Resume
                        </button>
                      )}
                      {job.status === 'completed' && (
                        <button className="text-orange-600 hover:underline text-xs">
                          Rollback
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showWizard && (
        <NewImportWizard
          portfolios={portfolios}
          onClose={() => setShowWizard(false)}
        />
      )}
    </>
  );
}
