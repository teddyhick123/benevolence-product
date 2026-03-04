'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ReportsDashboard from '@/components/reports/ReportsDashboard';
import ReportTemplateList from '@/components/reports/ReportTemplateList';
import ReportTemplateEditor from '@/components/reports/ReportTemplateEditor';
import DocumentList from '@/components/reports/DocumentList';
import ExportDataModal from '@/components/reports/ExportDataModal';
import ReportViewer from '@/components/reports/ReportViewer';

type TabId = 'overview' | 'templates' | 'documents' | 'schedules';

type GeneratedReport = {
  title: string;
  scope: string;
  content_blocks: any[];
  time_range: string;
  generated_at: string;
};

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Modal states
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedTemplateForGenerate, setSelectedTemplateForGenerate] = useState<any>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [generating, setGenerating] = useState(false);

  // Fetch user's portfolio ID
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const json = await res.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // Check URL params for tab
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'templates', 'documents', 'schedules'].includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, [searchParams]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleGenerateFromTemplate = async (template: any) => {
    if (!portfolioId) return;

    setSelectedTemplateForGenerate(template);
    setGenerating(true);

    try {
      const response = await fetch(`/api/portfolio/${portfolioId}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          save_document: true,
        }),
      });

      if (response.ok) {
        const { report } = await response.json();
        setGeneratedReport(report);
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setGenerating(false);
      setSelectedTemplateForGenerate(null);
    }
  };

  const handleQuickGenerate = async () => {
    if (!portfolioId) return;

    setGenerating(true);

    try {
      const response = await fetch(`/api/portfolio/${portfolioId}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'portfolio',
          include_sections: ['overview', 'financials', 'impact', 'trends'],
          time_range: '12m',
          save_document: true,
        }),
      });

      if (response.ok) {
        const { report } = await response.json();
        setGeneratedReport(report);
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">No portfolio found</h1>
        <p className="text-gray-500 mt-2">Please create a portfolio first.</p>
      </div>
    );
  }

  // Show report viewer if we have a generated report
  if (generatedReport) {
    return (
      <ReportViewer
        report={generatedReport}
        portfolioId={portfolioId}
        onClose={() => setGeneratedReport(null)}
      />
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 mt-1">
          Generate reports, manage templates, and export your data
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleQuickGenerate}
          disabled={generating}
          className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Quick Report'}
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Export Data
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-4 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-azure text-azure'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <ReportsDashboard
          portfolioId={portfolioId}
          onCreateTemplate={handleCreateTemplate}
          onGenerateReport={handleQuickGenerate}
        />
      )}

      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Report Templates</h2>
            <button
              onClick={handleCreateTemplate}
              className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
            >
              Create Template
            </button>
          </div>
          <ReportTemplateList
            portfolioId={portfolioId}
            onEdit={handleEditTemplate}
            onGenerate={handleGenerateFromTemplate}
          />
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Generated Documents</h2>
          <DocumentList portfolioId={portfolioId} />
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h2>
            </div>
            <div className="p-6">
              <ReportTemplateEditor
                portfolioId={portfolioId}
                template={editingTemplate}
                onSave={() => {
                  setShowTemplateEditor(false);
                  setEditingTemplate(null);
                }}
                onCancel={() => {
                  setShowTemplateEditor(false);
                  setEditingTemplate(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportDataModal
          portfolioId={portfolioId}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
