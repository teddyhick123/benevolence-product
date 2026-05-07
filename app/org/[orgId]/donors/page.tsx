'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import DonorDashboard from '@/components/donors/DonorDashboard';
import DonorList from '@/components/donors/DonorList';
import ContributionForm from '@/components/donors/ContributionForm';

export default function DonorsPage() {
  const params = useParams();
  const organizationId = params.orgId as string;
  const [view, setView] = useState<'dashboard' | 'list'>('dashboard');
  const [showContributionForm, setShowContributionForm] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Donors</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your donors and track contributions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/org/${organizationId}/donors/new`}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Add Donor
          </a>
          <button
            onClick={() => setShowContributionForm(true)}
            className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
          >
            Log Contribution
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setView('dashboard')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            view === 'dashboard'
              ? 'bg-azure text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setView('list')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            view === 'list'
              ? 'bg-azure text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Donors
        </button>
      </div>

      {/* Content */}
      {view === 'dashboard' ? (
        <DonorDashboard organizationId={organizationId} />
      ) : (
        <DonorList organizationId={organizationId} />
      )}

      {/* Contribution Form Modal */}
      {showContributionForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Log Contribution</h2>
            </div>
            <div className="p-6">
              <ContributionForm
                organizationId={organizationId}
                onSuccess={() => {
                  setShowContributionForm(false);
                  window.location.reload();
                }}
                onCancel={() => setShowContributionForm(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
