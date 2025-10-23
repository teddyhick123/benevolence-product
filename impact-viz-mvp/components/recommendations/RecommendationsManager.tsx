'use client';

import { useState } from 'react';
import RecommendationsView from './RecommendationsView';
import AddRecommendationModal from './AddRecommendationModal';

type Recommendation = {
  id: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation: any;
  contact_info: any;
  min_investment: number | null;
  max_investment: number | null;
  recommended_at: string;
};

type Props = {
  portfolioId: string;
  recommendations: Recommendation[];
  onUpdate: () => void;
};

export default function RecommendationsManager({ portfolioId, recommendations, onUpdate }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRecommendation, setEditingRecommendation] = useState<Recommendation | null>(null);

  const handleEdit = (rec: Recommendation) => {
    setEditingRecommendation(rec);
    setShowAddModal(true);
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/recommendations/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to archive recommendation');
      }

      onUpdate();
    } catch (err: any) {
      alert(`Failed to archive: ${err.message}`);
    }
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingRecommendation(null);
  };

  const handleSaved = () => {
    setShowAddModal(false);
    setEditingRecommendation(null);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      {/* Manager Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Manage Recommendations</h1>
          <p className="text-neutral-600 mt-1">
            Curate and manage philanthropic opportunities for your portfolio members
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 transition-opacity shadow-soft"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Recommendation
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-neutral-600">Total Recommendations</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{recommendations.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-600">Unique Sectors</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">
            {new Set(recommendations.map(r => r.sector).filter(Boolean)).size}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-600">With Contact Info</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">
            {recommendations.filter(r => r.contact_info).length}
          </div>
        </div>
      </div>

      {/* Recommendations Grid with Management Controls */}
      <RecommendationsView
        recommendations={recommendations.map(rec => ({
          ...rec,
          onEdit: handleEdit,
          onArchive: handleArchive,
          isManager: true,
        }))}
        loading={false}
      />

      {/* Add/Edit Modal */}
      {showAddModal && (
        <AddRecommendationModal
          portfolioId={portfolioId}
          recommendation={editingRecommendation}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
