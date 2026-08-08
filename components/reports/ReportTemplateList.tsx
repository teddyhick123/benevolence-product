'use client';

import { apiRequest } from "@/lib/api/client";
import { useReportsData } from "@/lib/reports/hooks";

import { useState } from 'react';
import { mutate } from "swr";

type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  config: {
    metric_codes?: string[];
    include_sections?: string[];
    time_range?: string;
    chart_preferences?: any[];
  };
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

interface Props {
  portfolioId: string;
  onEdit?: (template: ReportTemplate) => void;
  onGenerate?: (template: ReportTemplate) => void;
  onSchedule?: (template: ReportTemplate) => void;
}


export default function ReportTemplateList({ portfolioId, onEdit, onGenerate, onSchedule }: Props) {
  const { data, error, isLoading } = useReportsData<{ templates: ReportTemplate[] }>(
    `/api/portfolio/${portfolioId}/reports/templates`);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const templates = data?.templates ?? [];

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getScopeBadge = (scope: string) => {
    const colors: Record<string, string> = {
      portfolio: 'bg-blue-100 text-blue-800',
      holding: 'bg-green-100 text-green-800',
      sector: 'bg-purple-100 text-purple-800',
    };
    return colors[scope] || 'bg-gray-100 text-gray-800';
  };

  const getTimeRangeLabel = (range?: string) => {
    const labels: Record<string, string> = {
      '3m': '3 months',
      '6m': '6 months',
      '12m': '12 months',
      'ytd': 'Year to date',
      'all': 'All time',
    };
    return labels[range || ''] || range || '-';
  };

  const handleDelete = async (templateId: string) => {
    setDeleting(true);
    try {
      const response = await apiRequest(`/api/portfolio/${portfolioId}/reports/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        mutate(`/api/portfolio/${portfolioId}/reports/templates`);
        setDeleteConfirm(null);
      }
    } catch (err) {
      console.error('Failed to delete template:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      const response = await apiRequest(`/api/portfolio/${portfolioId}/reports/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });

      if (response.ok) {
        mutate(`/api/portfolio/${portfolioId}/reports/templates`);
      }
    } catch (err) {
      console.error('Failed to set default:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        Failed to load templates
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="font-medium">No templates yet</p>
        <p className="text-sm mt-1">Create a template to save report configurations for reuse</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {templates.map((template) => (
        <div
          key={template.id}
          className="bg-white rounded-lg border border-gray-200 p-6 hover:border-gray-300 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                {template.is_default && (
                  <span className="px-2 py-0.5 rounded text-xs bg-azure/10 text-azure">
                    Default
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getScopeBadge(template.scope)}`}>
                  {template.scope}
                </span>
              </div>
              {template.description && (
                <p className="text-sm text-gray-500 mt-1">{template.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onGenerate && (
                <button
                  onClick={() => onGenerate(template)}
                  className="px-3 py-1.5 text-sm bg-azure text-white rounded-lg hover:bg-azure/90"
                >
                  Generate
                </button>
              )}
            </div>
          </div>

          {/* Config Summary */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div>
              <span className="text-gray-400">Time Range:</span>{' '}
              {getTimeRangeLabel(template.config?.time_range)}
            </div>
            {template.config?.include_sections && template.config.include_sections.length > 0 && (
              <div>
                <span className="text-gray-400">Sections:</span>{' '}
                {template.config.include_sections.join(', ')}
              </div>
            )}
            {template.config?.metric_codes && template.config.metric_codes.length > 0 && (
              <div>
                <span className="text-gray-400">Metrics:</span>{' '}
                {template.config.metric_codes.length} selected
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Created {formatDate(template.created_at)}
            </span>
            <div className="flex items-center gap-3">
              {!template.is_default && (
                <button
                  onClick={() => handleSetDefault(template.id)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Set as default
                </button>
              )}
              {onSchedule && (
                <button
                  onClick={() => onSchedule(template)}
                  className="text-xs text-azure hover:underline"
                >
                  Schedule
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(template)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Edit
                </button>
              )}
              {deleteConfirm === template.id ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={deleting}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    {deleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-xs text-gray-500"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(template.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
