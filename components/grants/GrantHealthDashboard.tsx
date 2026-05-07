'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import RiskAlerts from './RiskAlerts';
import GrantExportButton from './GrantExportButton';

type GrantHealth = {
  holding_id: string;
  grant_id: string;
  grant_name: string;
  grant_type: string | null;
  health_score: number;
  risk_level: string;
  funds_allocated: number | null;
  total_scheduled: number;
  total_disbursed: number;
  payments_pending: number;
  total_milestones: number;
  milestones_completed: number;
  milestones_overdue: number;
  total_reports: number;
  reports_submitted: number;
  reports_overdue: number;
  active_workflows: number;
  workflow_tasks_pending: number;
  grant_period_start: string | null;
  grant_period_end: string | null;
};

type Deadline = {
  deadline_type: string;
  entity_type: string;
  entity_id: string;
  holding_name: string;
  title: string;
  due_date: string;
  days_until_due: number;
  priority: string;
};

interface Props {
  portfolioId: string;
}

export default function GrantHealthDashboard({ portfolioId }: Props) {
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState<GrantHealth[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [summary, setSummary] = useState({
    totalGrants: 0,
    avgHealthScore: 0,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0,
    totalDisbursed: 0,
    overdueItems: 0,
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch grant health data
        const { data: healthData, error: healthError } = await supabase
          .from('v_grant_health')
          .select('*')
          .eq('portfolio_id', portfolioId);

        if (healthError) throw healthError;
        setGrants(healthData || []);

        // Calculate summary
        const grantsList = healthData || [];
        const totalGrants = grantsList.length;
        const avgHealthScore = totalGrants > 0
          ? Math.round(grantsList.reduce((sum, g) => sum + (g.health_score || 0), 0) / totalGrants)
          : 0;
        const highRisk = grantsList.filter(g => g.risk_level === 'high').length;
        const mediumRisk = grantsList.filter(g => g.risk_level === 'medium').length;
        const totalDisbursed = grantsList.reduce((sum, g) => sum + (g.total_disbursed || 0), 0);
        const overdueItems = grantsList.reduce((sum, g) => sum + (g.milestones_overdue || 0) + (g.reports_overdue || 0), 0);

        setSummary({
          totalGrants,
          avgHealthScore,
          highRisk,
          mediumRisk,
          lowRisk: totalGrants - highRisk - mediumRisk,
          totalDisbursed,
          overdueItems,
        });

        // Fetch upcoming deadlines using RPC function
        const { data: deadlinesData, error: deadlinesError } = await supabase
          .rpc('get_upcoming_deadlines', {
            p_portfolio_id: portfolioId,
            p_days_ahead: 30,
          });

        if (!deadlinesError && deadlinesData) {
          setDeadlines(deadlinesData);
        }
      } catch (err) {
        console.error('Error fetching grant health data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [portfolioId]);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const getRiskBadge = (level: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-amber-100 text-amber-800',
      high: 'bg-red-100 text-red-800',
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      overdue: 'text-red-600 bg-red-50',
      urgent: 'text-amber-600 bg-amber-50',
      normal: 'text-gray-600 bg-gray-50',
    };
    return colors[priority] || 'text-gray-600 bg-gray-50';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Risk Alerts */}
      <RiskAlerts grants={grants} portfolioId={portfolioId} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total Grants</span>
            <span className="text-2xl font-bold text-gray-900">{summary.totalGrants}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {summary.highRisk > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-100 text-red-700">{summary.highRisk} high risk</span>
            )}
            {summary.mediumRisk > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{summary.mediumRisk} medium</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Avg Health Score</span>
            <span className={`text-2xl font-bold ${
              summary.avgHealthScore >= 80 ? 'text-green-600' :
              summary.avgHealthScore >= 50 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {summary.avgHealthScore}
            </span>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getHealthColor(summary.avgHealthScore)}`}
              style={{ width: `${summary.avgHealthScore}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total Disbursed</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalDisbursed)}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">Across all grants</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Attention Needed</span>
            <span className={`text-2xl font-bold ${summary.overdueItems > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {summary.overdueItems}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">Overdue milestones & reports</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grant List */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Grants Overview</h2>
            <GrantExportButton portfolioId={portfolioId} />
          </div>
          {grants.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="mt-2">No grants found in this portfolio.</p>
              <p className="text-sm">Start by adding grants to your holdings.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grant</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Health</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Milestones</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reports</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disbursed</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {grants.map((grant) => (
                    <tr key={grant.grant_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <a
                            href={`/dashboard/grants/${grant.grant_id}?portfolio_id=${portfolioId}`}
                            className="text-sm font-medium text-gray-900 hover:text-azure"
                          >
                            {grant.grant_name}
                          </a>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getRiskBadge(grant.risk_level)}`}>
                              {grant.risk_level}
                            </span>
                            {grant.grant_type && (
                              <span className="text-xs text-gray-500 capitalize">
                                {grant.grant_type.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${getHealthColor(grant.health_score)}`}
                              style={{ width: `${grant.health_score}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-900">{grant.health_score}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {grant.milestones_completed}/{grant.total_milestones}
                        </span>
                        {grant.milestones_overdue > 0 && (
                          <span className="ml-2 text-xs text-red-600">({grant.milestones_overdue} overdue)</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {grant.reports_submitted}/{grant.total_reports}
                        </span>
                        {grant.reports_overdue > 0 && (
                          <span className="ml-2 text-xs text-red-600">({grant.reports_overdue} overdue)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {formatCurrency(grant.total_disbursed)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Deadlines</h2>
            <p className="text-sm text-gray-500">Next 30 days</p>
          </div>
          {deadlines.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-sm">No upcoming deadlines</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {deadlines.slice(0, 10).map((deadline, idx) => (
                <li key={`${deadline.entity_id}-${idx}`} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getPriorityColor(deadline.priority)}`}>
                          {deadline.priority === 'overdue' ? `${Math.abs(deadline.days_until_due)}d overdue` :
                           deadline.priority === 'urgent' ? `${deadline.days_until_due}d left` :
                           formatDate(deadline.due_date)}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">{deadline.deadline_type}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900">{deadline.title}</p>
                      <p className="text-xs text-gray-500">{deadline.holding_name}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
