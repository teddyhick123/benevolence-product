'use client';

import { useState } from 'react';
import useSWR from 'swr';

type Insight = {
  id: string;
  holding_id: string | null;
  holding_name?: string;
  holding_sector?: string;
  insight_type: string;
  category: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  metric_code: string | null;
  metric_value: number | null;
  comparison_value: number | null;
  change_percent: number | null;
  data_context: Record<string, any>;
  suggested_actions: string[];
  is_active: boolean;
  action_taken: boolean;
  action_taken_at: string | null;
  dismissed_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type InsightsSummary = {
  total_active: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
};

interface Props {
  portfolioId: string;
  limit?: number;
  category?: string;
  severity?: string;
  onInsightAction?: (insightId: string, action: 'dismiss' | 'action_taken' | 'reactivate') => void;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; icon: string }> = {
  critical: { bg: 'bg-red-100', text: 'text-red-800', icon: '!' },
  high: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '!' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '!' },
  low: { bg: 'bg-blue-100', text: 'text-blue-800', icon: 'i' },
  info: { bg: 'bg-gray-100', text: 'text-gray-800', icon: 'i' },
};

const CATEGORY_ICONS: Record<string, string> = {
  performance: 'chart',
  risk: 'shield',
  compliance: 'check',
  opportunity: 'star',
  alert: 'bell',
  trend: 'trending',
};

export default function InsightsPanel({
  portfolioId,
  limit = 20,
  category: filterCategory,
  severity: filterSeverity,
  onInsightAction,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(filterCategory || null);
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(filterSeverity || null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    active_only: (!showDismissed).toString(),
  });
  if (selectedCategory) queryParams.set('category', selectedCategory);
  if (selectedSeverity) queryParams.set('severity', selectedSeverity);

  const { data, error, isLoading, mutate } = useSWR<{ insights: Insight[]; summary: InsightsSummary }>(
    `/api/portfolio/${portfolioId}/analytics/insights?${queryParams}`,
    fetcher
  );

  const insights = data?.insights ?? [];
  const summary = data?.summary;

  const handleAction = async (insightId: string, action: 'dismiss' | 'action_taken' | 'reactivate') => {
    setActionLoading(insightId);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/analytics/insights`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight_id: insightId, action }),
      });
      if (res.ok) {
        mutate();
        onInsightAction?.(insightId, action);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatChange = (change: number | null) => {
    if (change == null) return null;
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  const categories = summary?.by_category ? Object.keys(summary.by_category) : [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Insights & Recommendations</h3>
          {summary && (
            <span className="px-2 py-0.5 bg-azure/10 text-azure rounded text-sm font-medium">
              {summary.total_active} active
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-3">
        {/* Severity Filter */}
        <div className="flex items-center gap-1">
          {Object.entries(SEVERITY_CONFIG).map(([sev, config]) => {
            const count = summary?.by_severity?.[sev] ?? 0;
            return (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(selectedSeverity === sev ? null : sev)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedSeverity === sev
                    ? `${config.bg} ${config.text}`
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {sev} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-gray-300" />

        {/* Category Filter */}
        {categories.length > 0 && (
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value || null)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Show Dismissed Toggle */}
        <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={(e) => setShowDismissed(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show dismissed
        </label>
      </div>

      {/* Insights List */}
      <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azure mx-auto"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-gray-500">
            <p>Error loading insights</p>
          </div>
        ) : insights.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="font-medium">No insights found</p>
            <p className="text-sm mt-1">
              {showDismissed ? 'No insights match the current filters.' : 'Great work! No active insights at this time.'}
            </p>
          </div>
        ) : (
          insights.map((insight) => {
            const severityConfig = SEVERITY_CONFIG[insight.severity] || SEVERITY_CONFIG.info;
            const isExpanded = expandedInsight === insight.id;

            return (
              <div
                key={insight.id}
                className={`px-6 py-4 hover:bg-gray-50 ${!insight.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Severity Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${severityConfig.bg} ${severityConfig.text} flex-shrink-0`}>
                    <span className="font-bold text-sm">{severityConfig.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{insight.title}</h4>
                        <p className="text-sm text-gray-600 mt-0.5">{insight.description}</p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(insight.created_at)}</span>
                    </div>

                    {/* Meta Tags */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${severityConfig.bg} ${severityConfig.text}`}>
                        {insight.severity}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                        {insight.category}
                      </span>
                      {insight.holding_name && (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                          {insight.holding_name}
                        </span>
                      )}
                      {insight.change_percent != null && (
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          insight.change_percent > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {formatChange(insight.change_percent)}
                        </span>
                      )}
                      {insight.action_taken && (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">
                          Action Taken
                        </span>
                      )}
                      {!insight.is_active && (
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-500">
                          Dismissed
                        </span>
                      )}
                    </div>

                    {/* Expandable Section */}
                    {(insight.suggested_actions?.length > 0 || Object.keys(insight.data_context || {}).length > 0) && (
                      <button
                        onClick={() => setExpandedInsight(isExpanded ? null : insight.id)}
                        className="text-xs text-azure hover:underline mt-2"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {/* Suggested Actions */}
                        {insight.suggested_actions?.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Suggested Actions</p>
                            <ul className="space-y-1">
                              {insight.suggested_actions.map((action, i) => (
                                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                  <span className="text-azure mt-0.5">•</span>
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Context Data */}
                        {Object.keys(insight.data_context || {}).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Context</p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {Object.entries(insight.data_context).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-gray-500">{key}: </span>
                                  <span className="text-gray-900">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    {insight.is_active && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleAction(insight.id, 'action_taken')}
                          disabled={actionLoading === insight.id || insight.action_taken}
                          className="px-3 py-1 text-xs bg-azure text-white rounded hover:bg-azure/90 disabled:opacity-50"
                        >
                          {insight.action_taken ? 'Action Recorded' : 'Mark Action Taken'}
                        </button>
                        <button
                          onClick={() => handleAction(insight.id, 'dismiss')}
                          disabled={actionLoading === insight.id}
                          className="px-3 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {!insight.is_active && (
                      <button
                        onClick={() => handleAction(insight.id, 'reactivate')}
                        disabled={actionLoading === insight.id}
                        className="mt-3 px-3 py-1 text-xs text-azure border border-azure rounded hover:bg-azure/5 disabled:opacity-50"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
