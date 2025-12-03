'use client';

import { useState, useEffect } from 'react';

type StatusHistoryEntry = {
  id: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  created_at: string;
  user: {
    id: string;
    email: string;
  };
};

type Props = {
  recommendationId: string;
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  reviewing: 'Reviewing',
  interested: 'Interested',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting Scheduled',
  in_discussion: 'In Discussion',
  approved: 'Approved',
  declined: 'Declined',
  donated: 'Donated',
};

export default function StatusHistory({ recommendationId }: Props) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, [recommendationId]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/status`);
      const data = await res.json();

      if (res.ok) {
        setHistory(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch status history:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getUserName = (email: string) => {
    return email.split('@')[0];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="inline-block w-5 h-5 border-3 border-azure/30 border-t-azure rounded-full animate-spin"></div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-sm text-neutral-500 text-center py-4">No status history yet</div>
    );
  }

  const displayHistory = expanded ? history : history.slice(0, 3);

  return (
    <div className="space-y-3">
      {displayHistory.map((entry, index) => (
        <div key={entry.id} className="flex gap-3">
          {/* Timeline Line */}
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-azure mt-2"></div>
            {index < displayHistory.length - 1 && (
              <div className="w-0.5 flex-1 bg-neutral-200 my-1"></div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium text-neutral-900">
                {entry.old_status ? (
                  <>
                    <span className="text-neutral-500">{STATUS_LABELS[entry.old_status]}</span>
                    <span className="text-neutral-400 mx-1">→</span>
                    <span className="text-azure">{STATUS_LABELS[entry.new_status]}</span>
                  </>
                ) : (
                  <span className="text-azure">{STATUS_LABELS[entry.new_status]}</span>
                )}
              </span>
            </div>

            {entry.notes && (
              <p className="text-sm text-neutral-600 mt-1 italic">&ldquo;{entry.notes}&rdquo;</p>
            )}

            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
              <span>{getUserName(entry.user.email)}</span>
              <span>•</span>
              <span>{formatDate(entry.created_at)}</span>
            </div>
          </div>
        </div>
      ))}

      {history.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-azure hover:underline flex items-center gap-1 ml-5"
        >
          {expanded ? (
            <>
              Show less
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </>
          ) : (
            <>
              Show {history.length - 3} more
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}
