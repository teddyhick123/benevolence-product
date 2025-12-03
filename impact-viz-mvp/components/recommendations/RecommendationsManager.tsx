'use client';

import { useState } from 'react';
import RecommendationsView from './RecommendationsView';
import AddRecommendationModal from './AddRecommendationModal';
import { Recommendation } from '@/lib/schemas/recommendations';

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-sm text-neutral-600">Total Recommendations</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{recommendations.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-neutral-600">Total Favorites</div>
          <div className="text-2xl font-bold text-red-600 mt-1 flex items-center gap-2">
            {recommendations.reduce((sum, r) => sum + (r.favorite_count || 0), 0)}
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
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
        recommendations={recommendations}
        loading={false}
        isManager={true}
        onEdit={handleEdit}
        onArchive={handleArchive}
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
