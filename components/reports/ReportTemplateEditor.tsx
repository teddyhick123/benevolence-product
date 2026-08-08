'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import { useReportsData } from "@/lib/reports/hooks";

import { useState, useEffect } from 'react';

type Holding = {
  id: string;
  name: string;
  sector: string | null;
};

type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  config: {
    metric_codes?: string[];
    include_sections?: string[];
    time_range?: string;
    chart_preferences?: Array<{ metric_code: string; chart_type: string }>;
  };
  is_default: boolean;
};

interface Props {
  portfolioId: string;
  template?: ReportTemplate | null;
  onSave?: (template: ReportTemplate) => void;
  onCancel?: () => void;
}


const AVAILABLE_SECTIONS = [
  { id: 'overview', label: 'Overview', description: 'Basic information and summary' },
  { id: 'financials', label: 'Financials', description: 'Financial data and allocations' },
  { id: 'impact', label: 'Impact Metrics', description: 'KPIs and impact data' },
  { id: 'trends', label: 'Trends', description: 'Charts showing metric trends over time' },
  { id: 'comparison', label: 'Comparison', description: 'Compare holdings or sectors' },
];

const TIME_RANGES = [
  { value: '3m', label: '3 Months' },
  { value: '6m', label: '6 Months' },
  { value: '12m', label: '12 Months' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'all', label: 'All Time' },
];

const CHART_TYPES = [
  { value: 'line', label: 'Line Chart' },
  { value: 'bar', label: 'Bar Chart' },
  { value: 'area', label: 'Area Chart' },
  { value: 'pie', label: 'Pie Chart' },
];

export default function ReportTemplateEditor({ portfolioId, template, onSave, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [scope, setScope] = useState(template?.scope || 'portfolio');
  const [includeSections, setIncludeSections] = useState<string[]>(
    template?.config?.include_sections || ['overview', 'financials', 'impact', 'trends']
  );
  const [timeRange, setTimeRange] = useState(template?.config?.time_range || '12m');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    template?.config?.metric_codes || []
  );
  const [chartPreferences, setChartPreferences] = useState<Array<{ metric_code: string; chart_type: string }>>(
    template?.config?.chart_preferences || []
  );
  const [isDefault, setIsDefault] = useState(template?.is_default || false);

  // Fetch available metrics
  const { data: metricsData } = useReportsData<{ data: Array<{ metric_code: string; metric_name: string }> }>(
    `/api/portfolio/${portfolioId}/kpis`);

  const availableMetrics = metricsData?.data || [];

  const toggleSection = (sectionId: string) => {
    setIncludeSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(s => s !== sectionId)
        : [...prev, sectionId]
    );
  };

  const toggleMetric = (metricCode: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricCode)
        ? prev.filter(m => m !== metricCode)
        : [...prev, metricCode]
    );
  };

  const setChartType = (metricCode: string, chartType: string) => {
    setChartPreferences(prev => {
      const existing = prev.find(p => p.metric_code === metricCode);
      if (existing) {
        return prev.map(p => p.metric_code === metricCode ? { ...p, chart_type: chartType } : p);
      }
      return [...prev, { metric_code: metricCode, chart_type: chartType }];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const config = {
        metric_codes: selectedMetrics,
        include_sections: includeSections,
        time_range: timeRange,
        chart_preferences: chartPreferences.filter(p => selectedMetrics.includes(p.metric_code)),
      };

      const url = template?.id
        ? `/api/portfolio/${portfolioId}/reports/templates/${template.id}`
        : `/api/portfolio/${portfolioId}/reports/templates`;

      const method = template?.id ? 'PATCH' : 'POST';

      const response = await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || null,
          scope,
          config,
          is_default: isDefault,
        }),
      });

      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data.error || 'Failed to save template');
      }

      const { template: savedTemplate } = await readJson(response);
      onSave?.(savedTemplate);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., Quarterly Impact Report"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Describe what this template is for..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Scope *
            </label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
            >
              <option value="portfolio">Portfolio (all holdings)</option>
              <option value="holding">Single Holding</option>
              <option value="sector">Sector Analysis</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Range *
            </label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
            >
              {TIME_RANGES.map((tr) => (
                <option key={tr.value} value={tr.value}>{tr.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Include Sections
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {AVAILABLE_SECTIONS.map((section) => (
            <label
              key={section.id}
              className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                includeSections.includes(section.id)
                  ? 'border-azure bg-azure/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={includeSections.includes(section.id)}
                onChange={() => toggleSection(section.id)}
                className="mt-0.5 rounded text-azure"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{section.label}</p>
                <p className="text-xs text-gray-500">{section.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Metrics Selection */}
      {availableMetrics.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Metrics (optional - leave empty for all available)
          </label>
          <div className="border border-gray-200 rounded-lg p-4 max-h-48 overflow-y-auto">
            <div className="space-y-2">
              {availableMetrics.map((metric) => (
                <div key={metric.metric_code} className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedMetrics.includes(metric.metric_code)}
                      onChange={() => toggleMetric(metric.metric_code)}
                      className="rounded text-azure"
                    />
                    <span className="text-sm text-gray-700">
                      {metric.metric_name || metric.metric_code}
                    </span>
                  </label>
                  {selectedMetrics.includes(metric.metric_code) && (
                    <select
                      value={chartPreferences.find(p => p.metric_code === metric.metric_code)?.chart_type || 'line'}
                      onChange={(e) => setChartType(metric.metric_code, e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-200 rounded"
                    >
                      {CHART_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {selectedMetrics.length === 0 ? 'All metrics will be included' : `${selectedMetrics.length} metrics selected`}
          </p>
        </div>
      )}

      {/* Options */}
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="rounded text-azure"
          />
          <span className="text-sm text-gray-700">Set as default template for this scope</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : template?.id ? 'Update Template' : 'Create Template'}
        </button>
      </div>
    </form>
  );
}
