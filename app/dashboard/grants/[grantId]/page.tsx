'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import DocumentManager from '@/components/grants/DocumentManager';
import BudgetTracker from '@/components/grants/BudgetTracker';
import GrantExportButton from '@/components/grants/GrantExportButton';

type GrantDetails = {
  id: string;
  holding_id: string;
  grant_period_start: string | null;
  grant_period_end: string | null;
  grant_type: string | null;
  renewal_eligible: boolean;
  renewal_date: string | null;
  deliverables: string | null;
  reporting_frequency: string | null;
  next_report_due: string | null;
  holding: {
    id: string;
    name: string;
    sector: string | null;
    country: string | null;
    funds_allocated: number | null;
    status: string;
  };
};

type GrantHealth = {
  health_score: number;
  risk_level: string;
  total_milestones: number;
  milestones_completed: number;
  milestones_overdue: number;
  total_reports: number;
  reports_submitted: number;
  reports_overdue: number;
  total_disbursed: number;
  payments_pending: number;
  active_workflows: number;
  workflow_tasks_pending: number;
};

type Milestone = {
  id: string;
  milestone_name: string;
  description: string | null;
  due_date: string | null;
  completed_date: string | null;
  status: string;
  notes: string | null;
};

type Communication = {
  id: string;
  direction: string;
  comm_type: string;
  subject: string | null;
  summary: string;
  contact_name: string | null;
  occurred_at: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
};

export default function GrantDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const grantId = params.grantId as string;
  const portfolioId = searchParams.get('portfolio_id');

  const [loading, setLoading] = useState(true);
  const [grant, setGrant] = useState<GrantDetails | null>(null);
  const [health, setHealth] = useState<GrantHealth | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [activeSection, setActiveSection] = useState<'overview' | 'milestones' | 'communications' | 'documents' | 'budget'>('overview');

  useEffect(() => {
    if (!grantId) return;

    async function fetchGrantDetails() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch grant details with holding info
        const { data: grantData, error: grantError } = await supabase
          .from('grant_details')
          .select(`
            *,
            holding:holdings(id, name, sector, country, funds_allocated, status)
          `)
          .eq('id', grantId)
          .single();

        if (grantError) throw grantError;
        setGrant(grantData as any);

        // Fetch health data from view
        const { data: healthData } = await supabase
          .from('v_grant_health')
          .select('*')
          .eq('grant_id', grantId)
          .single();

        if (healthData) setHealth(healthData as any);

        // Fetch milestones
        const { data: milestonesData } = await supabase
          .from('grant_milestones')
          .select('*')
          .eq('grant_id', grantId)
          .order('due_date', { ascending: true });

        if (milestonesData) setMilestones(milestonesData);

        // Fetch recent communications
        const { data: commsData } = await supabase
          .from('grant_communications')
          .select('*')
          .eq('grant_id', grantId)
          .order('occurred_at', { ascending: false })
          .limit(10);

        if (commsData) setCommunications(commsData);
      } catch (err) {
        console.error('Error fetching grant details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchGrantDetails();
  }, [grantId]);

  const formatDate = (date: string | null) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 50) return 'text-amber-600 bg-amber-100';
    return 'text-red-600 bg-red-100';
  };

  const getRiskBadge = (level: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-amber-100 text-amber-800',
      high: 'bg-red-100 text-red-800',
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-700',
      in_progress: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      overdue: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-200 text-gray-500',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900">Grant Not Found</h3>
          <p className="mt-1 text-sm text-gray-500">The requested grant could not be found.</p>
          <Link
            href="/dashboard/grants"
            className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-azure hover:text-azure/80"
          >
            &larr; Back to Grants
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <a
              href={portfolioId ? `/dashboard/grants?portfolio_id=${portfolioId}` : '/dashboard/grants'}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <h1 className="text-3xl font-serif text-gray-900">{grant.holding?.name}</h1>
            {health && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskBadge(health.risk_level)}`}>
                {health.risk_level.charAt(0).toUpperCase() + health.risk_level.slice(1)} Risk
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {grant.grant_type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || 'Grant'}
            {grant.holding?.sector && ` | ${grant.holding.sector}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {portfolioId && (
            <GrantExportButton portfolioId={portfolioId} grantId={grantId} />
          )}
          <a
            href={`/dashboard/holdings/${grant.holding_id}?portfolio_id=${portfolioId}`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            View Holding
          </a>
        </div>
      </div>

      {/* Health Score Card */}
      {health && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Health Score</span>
              <span className={`text-2xl font-bold ${getHealthColor(health.health_score).split(' ')[0]}`}>
                {health.health_score}
              </span>
            </div>
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${health.health_score >= 80 ? 'bg-green-500' : health.health_score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${health.health_score}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <span className="text-sm font-medium text-gray-500">Milestones</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{health.milestones_completed}</span>
              <span className="text-sm text-gray-500">/ {health.total_milestones}</span>
            </div>
            {health.milestones_overdue > 0 && (
              <span className="text-xs text-red-600">{health.milestones_overdue} overdue</span>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <span className="text-sm font-medium text-gray-500">Reports</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{health.reports_submitted}</span>
              <span className="text-sm text-gray-500">/ {health.total_reports}</span>
            </div>
            {health.reports_overdue > 0 && (
              <span className="text-xs text-red-600">{health.reports_overdue} overdue</span>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <span className="text-sm font-medium text-gray-500">Disbursed</span>
            <div className="mt-2">
              <span className="text-2xl font-bold text-gray-900">{formatCurrency(health.total_disbursed)}</span>
            </div>
            {health.payments_pending > 0 && (
              <span className="text-xs text-amber-600">{health.payments_pending} pending</span>
            )}
          </div>
        </div>
      )}

      {/* Grant Details */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Grant Details</h2>
        </div>
        <div className="p-6">
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">Grant Period</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(grant.grant_period_start)} - {formatDate(grant.grant_period_end)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Funds Allocated</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatCurrency(grant.holding?.funds_allocated)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Reporting Frequency</dt>
              <dd className="mt-1 text-sm text-gray-900 capitalize">{grant.reporting_frequency || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Next Report Due</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatDate(grant.next_report_due)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Renewal Eligible</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {grant.renewal_eligible ? `Yes (${formatDate(grant.renewal_date)})` : 'No'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  grant.holding?.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {grant.holding?.status}
                </span>
              </dd>
            </div>
          </dl>
          {grant.deliverables && (
            <div className="mt-6">
              <dt className="text-sm font-medium text-gray-500">Deliverables</dt>
              <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{grant.deliverables}</dd>
            </div>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['overview', 'milestones', 'communications', 'documents', 'budget'] as const).map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm capitalize
                ${activeSection === section
                  ? 'border-azure text-azure'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {section}
            </button>
          ))}
        </nav>
      </div>

      {/* Section Content */}
      {activeSection === 'milestones' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Milestones</h2>
            <span className="text-sm text-gray-500">{milestones.length} total</span>
          </div>
          {milestones.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No milestones defined for this grant.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {milestones.map((milestone) => (
                <li key={milestone.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-medium text-gray-900">{milestone.milestone_name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(milestone.status)}`}>
                          {milestone.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {milestone.description && (
                        <p className="mt-1 text-sm text-gray-500">{milestone.description}</p>
                      )}
                      {milestone.notes && (
                        <p className="mt-2 text-sm text-gray-600 italic">{milestone.notes}</p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-gray-500">Due: {formatDate(milestone.due_date)}</div>
                      {milestone.completed_date && (
                        <div className="text-green-600">Completed: {formatDate(milestone.completed_date)}</div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeSection === 'communications' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Communications</h2>
            <span className="text-sm text-gray-500">{communications.length} entries</span>
          </div>
          {communications.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No communications logged for this grant.
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {communications.map((comm) => (
                <li key={comm.id} className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      comm.direction === 'inbound' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                    }`}>
                      {comm.direction === 'inbound' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 capitalize">{comm.comm_type.replace(/_/g, ' ')}</span>
                        {comm.contact_name && (
                          <span className="text-sm text-gray-500">with {comm.contact_name}</span>
                        )}
                        {comm.follow_up_required && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            Follow-up needed
                          </span>
                        )}
                      </div>
                      {comm.subject && (
                        <p className="text-sm font-medium text-gray-700 mt-1">{comm.subject}</p>
                      )}
                      <p className="text-sm text-gray-600 mt-1">{comm.summary}</p>
                      <p className="text-xs text-gray-400 mt-2">{formatDate(comm.occurred_at)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeSection === 'documents' && portfolioId && (
        <DocumentManager grantId={grantId} portfolioId={portfolioId} />
      )}

      {activeSection === 'budget' && portfolioId && (
        <BudgetTracker grantId={grantId} portfolioId={portfolioId} />
      )}

      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Workflows */}
          {health && health.active_workflows > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Workflows</h3>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-azure">{health.active_workflows}</span>
                <span className="text-sm text-gray-500">
                  {health.workflow_tasks_pending} tasks pending
                </span>
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Total Milestones</dt>
                <dd className="text-sm font-medium text-gray-900">{milestones.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Communications Logged</dt>
                <dd className="text-sm font-medium text-gray-900">{communications.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Grant Duration</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {grant.grant_period_start && grant.grant_period_end
                    ? `${Math.ceil((new Date(grant.grant_period_end).getTime() - new Date(grant.grant_period_start).getTime()) / (1000 * 60 * 60 * 24 * 30))} months`
                    : 'Not set'}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
