'use client';

import { useState } from 'react';

type StatusType =
  | 'new'
  | 'reviewing'
  | 'interested'
  | 'contacted'
  | 'meeting_scheduled'
  | 'in_discussion'
  | 'approved'
  | 'declined'
  | 'donated';

type Props = {
  recommendationId: string;
  currentStatus: StatusType;
  onStatusChange?: (newStatus: StatusType) => void;
  readonly?: boolean;
};

const STATUS_CONFIG: Record<
  StatusType,
  { label: string; color: string; bgColor: string; borderColor: string; icon: string }
> = {
  new: {
    label: 'New',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '✨',
  },
  reviewing: {
    label: 'Reviewing',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: '👀',
  },
  interested: {
    label: 'Interested',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    icon: '⭐',
  },
  contacted: {
    label: 'Contacted',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '📧',
  },
  meeting_scheduled: {
    label: 'Meeting Scheduled',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    icon: '📅',
  },
  in_discussion: {
    label: 'In Discussion',
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-200',
    icon: '💬',
  },
  approved: {
    label: 'Approved',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    icon: '✅',
  },
  declined: {
    label: 'Declined',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '❌',
  },
  donated: {
    label: 'Donated',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '🎁',
  },
};

export default function StatusBadge({ recommendationId, currentStatus, onStatusChange, readonly = false }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<StatusType>(currentStatus);
  const [notes, setNotes] = useState('');
  const [updating, setUpdating] = useState(false);

  const config = STATUS_CONFIG[currentStatus];

  const handleUpdateStatus = async () => {
    if (updating || selectedStatus === currentStatus) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: selectedStatus,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.ok) {
        onStatusChange?.(selectedStatus);
        setShowModal(false);
        setNotes('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update status');
      }
    } catch (err) {
      alert('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  if (readonly) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color} ${config.bgColor} ${config.borderColor}`}
      >
        <span>{config.icon}</span>
        {config.label}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all hover:shadow-md ${config.color} ${config.bgColor} ${config.borderColor}`}
      >
        <span>{config.icon}</span>
        {config.label}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Status Update Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Update Status</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Status Options */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {(Object.keys(STATUS_CONFIG) as StatusType[]).map((status) => {
                const statusConfig = STATUS_CONFIG[status];
                const isSelected = selectedStatus === status;

                return (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `${statusConfig.bgColor} ${statusConfig.borderColor}`
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{statusConfig.icon}</span>
                      <div className="flex-1">
                        <div className={`font-medium ${isSelected ? statusConfig.color : 'text-neutral-900'}`}>
                          {statusConfig.label}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className={`w-5 h-5 ${statusConfig.color}`} fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Optional Notes */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context about this status change..."
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure resize-none"
                rows={3}
                maxLength={500}
              />
              <div className="text-xs text-neutral-500 mt-1 text-right">{notes.length}/500</div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateStatus}
                disabled={updating || selectedStatus === currentStatus}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
