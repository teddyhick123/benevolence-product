'use client';

import { useReportsData } from "@/lib/reports/hooks";

import { useState, useEffect } from 'react';

type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  config: any;
  is_default: boolean;
  created_at: string;
};

type GeneratedDocument = {
  id: string;
  title: string;
  document_type: string;
  format: string;
  scope: string;
  status: string;
  is_public: boolean;
  share_token: string | null;
  generated_at: string;
  template_name: string | null;
  holding_name: string | null;
};

type ReportSchedule = {
  id: string;
  name: string;
  frequency: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  template_name: string | null;
};

interface Props {
  portfolioId: string;
  onCreateTemplate?: () => void;
  onGenerateReport?: () => void;
  onViewDocument?: (documentId: string) => void;
}


export default function ReportsDashboard({ portfolioId, onCreateTemplate, onGenerateReport, onViewDocument }: Props) {
  const { data: templatesData, error: templatesError } = useReportsData<{ templates: ReportTemplate[] }>(
    `/api/portfolio/${portfolioId}/reports/templates`);

  const { data: documentsData, error: documentsError } = useReportsData<{ documents: GeneratedDocument[]; count: number }>(
    `/api/portfolio/${portfolioId}/reports/documents?limit=5`);

  const { data: schedulesData, error: schedulesError } = useReportsData<{ schedules: ReportSchedule[] }>(
    `/api/portfolio/${portfolioId}/reports/schedules?active_only=true`);

  const templates = templatesData?.templates ?? [];
  const documents = documentsData?.documents ?? [];
  const schedules = schedulesData?.schedules ?? [];

  const loading = !templatesData && !templatesError;

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      report: 'bg-indigo-100 text-indigo-800',
      export: 'bg-amber-100 text-amber-800',
      summary: 'bg-teal-100 text-teal-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getFrequencyLabel = (freq: string) => {
    const labels: Record<string, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
    };
    return labels[freq] || freq;
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Templates</span>
            <span className="text-2xl font-bold text-gray-900">{templates.length}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">
              {templates.filter(t => t.scope === 'portfolio').length} portfolio
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">
              {templates.filter(t => t.scope === 'holding').length} holding
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Documents</span>
            <span className="text-2xl font-bold text-gray-900">{documentsData?.count ?? 0}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Generated reports and exports
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Active Schedules</span>
            <span className="text-2xl font-bold text-azure">{schedules.length}</span>
          </div>
          {schedules.length > 0 && schedules[0].next_run_at && (
            <p className="mt-2 text-xs text-gray-500">
              Next: {formatDate(schedules[0].next_run_at)}
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3">
        {onGenerateReport && (
          <button
            onClick={onGenerateReport}
            className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
          >
            Generate Report
          </button>
        )}
        {onCreateTemplate && (
          <button
            onClick={onCreateTemplate}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Create Template
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent Documents</h2>
            <a href={`#documents`} className="text-sm text-azure hover:underline">
              View all
            </a>
          </div>
          {documents.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>No documents generated yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onViewDocument?.(doc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTypeBadge(doc.document_type)}`}>
                          {doc.document_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getScopeBadge(doc.scope)}`}>
                          {doc.scope}
                        </span>
                        <span className="text-xs text-gray-400">{doc.format.toUpperCase()}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(doc.generated_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Templates */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Templates</h2>
            {onCreateTemplate && (
              <button onClick={onCreateTemplate} className="text-sm text-azure hover:underline">
                + New
              </button>
            )}
          </div>
          {templates.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>No templates created yet.</p>
              {onCreateTemplate && (
                <button onClick={onCreateTemplate} className="mt-2 text-azure hover:underline">
                  Create your first template
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {templates.slice(0, 5).map((template) => (
                <li key={template.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {template.name}
                        {template.is_default && (
                          <span className="ml-2 text-xs text-azure">(Default)</span>
                        )}
                      </p>
                      {template.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getScopeBadge(template.scope)}`}>
                      {template.scope}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Scheduled Reports */}
      {schedules.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Scheduled Reports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Schedule
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Frequency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Run
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Runs
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-gray-900">{schedule.name}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {schedule.template_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                        {getFrequencyLabel(schedule.frequency)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(schedule.next_run_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {schedule.run_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
