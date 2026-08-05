'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { mutate } from 'swr';
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

function ReportsLoading() {
  return (
    <div className="p-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 rounded-2xl bg-neutral-200"></div>
        <div className="h-64 rounded-2xl bg-neutral-200"></div>
      </div>
    </div>
  );
}

function ReportsPageContent() {
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
    return <ReportsLoading />;
  }

  if (!portfolioId) {
    return (
      <div className="p-8 text-center">
        <h1 className="font-serif text-xl font-medium text-ink">No portfolio found</h1>
        <p className="mt-2 text-neutral-600">Please create a portfolio first.</p>
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
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-medium text-ink">Reports</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Generate reports, manage templates, and export your data
        </p>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          onClick={handleQuickGenerate}
          disabled={generating}
          className="rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Quick Report'}
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow will-change-transform rm:transition-none rm:transform-none"
        >
          Export Data
        </button>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-black/5 bg-white p-1.5 shadow-soft">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Report views">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-azure text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-azure/5 hover:text-azure'
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
            <h2 className="font-serif text-xl font-medium text-ink">Report Templates</h2>
            <button
              onClick={handleCreateTemplate}
              className="rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90"
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
          <h2 className="font-serif text-xl font-medium text-ink">Generated Documents</h2>
          <DocumentList portfolioId={portfolioId} />
        </div>
      )}

      {/* Template Editor Modal */}
      {showTemplateEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-soft">
            <div className="border-b border-black/5 p-6">
              <h2 className="font-serif text-xl font-medium text-ink">
                {editingTemplate ? 'Edit Template' : 'Create Template'}
              </h2>
            </div>
            <div className="p-6">
              <ReportTemplateEditor
                portfolioId={portfolioId}
                template={editingTemplate}
                onSave={() => {
                  mutate(`/api/portfolio/${portfolioId}/reports/templates`);
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

export default function ReportsPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <ReportsPageContent />
    </Suspense>
  );
}
