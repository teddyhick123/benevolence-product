'use client';

import { useState, useEffect } from 'react';
import PayoutTracker from './PayoutTracker';
import DisqualifiedPersonsRegistry from './DisqualifiedPersonsRegistry';
import FilingCalendar from './FilingCalendar';
import ExpenditureResponsibilityList from './ExpenditureResponsibilityList';
import StateRegistrationTracker from './StateRegistrationTracker';
import ComplianceExportButton from './ComplianceExportButton';

interface DashboardData {
  dashboard: {
    compliance_health_score: number;
    filings_overdue: number;
    filings_due_soon: number;
    incidents_flagged: number;
    incidents_confirmed: number;
    state_renewals_overdue: number;
    active_disqualified_persons: number;
  } | null;
  upcoming_deadlines: any[];
  open_incidents: any[];
  profile: any | null;
}

interface Props {
  orgId: string;
  portfolioId: string;
}

type TabId = 'overview' | 'payout' | 'disqualified' | 'filings' | 'states' | 'er';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'payout', label: 'Payout Tracker' },
  { id: 'disqualified', label: 'Disqualified Persons' },
  { id: 'filings', label: 'Filing Calendar' },
  { id: 'states', label: 'State Registrations' },
  { id: 'er', label: 'Expenditure Responsibility' },
];

function HealthGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  const label = score >= 80 ? 'Good' : score >= 60 ? 'Needs Attention' : 'At Risk';
  const radius = 40;
  const circumference = Math.PI * radius; // half circle
  const strokeDash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="100" height="60" viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Score arc */}
        <path
          d="M 10 55 A 40 40 0 0 1 90 55"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${strokeDash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="-mt-3 text-center">
        <div className="text-2xl font-bold" style={{ color }}>{score}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
}

export default function ComplianceDashboard({ orgId, portfolioId }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/org/${orgId}/compliance/dashboard`);
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId]);

  const d = data?.dashboard;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance & Regulatory</h1>
          <p className="text-gray-500 mt-1">IRC §§ 4941–4945, 990-PF, filing calendar, and state registrations</p>
        </div>
        <ComplianceExportButton portfolioId={portfolioId} taxYear={currentYear} />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-azure text-azure'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loading ? (
            <div className="animate-pulse grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
            </div>
          ) : (
            <>
              {/* Health score + stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center col-span-1 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Health Score</p>
                  <HealthGauge score={d?.compliance_health_score ?? 100} />
                </div>
                <div className={`bg-white border rounded-xl p-4 ${(d?.filings_overdue ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filings Overdue</p>
                  <p className={`text-3xl font-bold mt-2 ${(d?.filings_overdue ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {d?.filings_overdue ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{d?.filings_due_soon ?? 0} due within 30 days</p>
                </div>
                <div className={`bg-white border rounded-xl p-4 ${(d?.incidents_flagged ?? 0) > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200'}`}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Self-Dealing Alerts</p>
                  <p className={`text-3xl font-bold mt-2 ${(d?.incidents_flagged ?? 0) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {(d?.incidents_flagged ?? 0) + (d?.incidents_confirmed ?? 0)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{d?.incidents_confirmed ?? 0} confirmed, {d?.incidents_flagged ?? 0} flagged</p>
                </div>
                <div className={`bg-white border rounded-xl p-4 ${(d?.state_renewals_overdue ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">State Renewals</p>
                  <p className={`text-3xl font-bold mt-2 ${(d?.state_renewals_overdue ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    {d?.state_renewals_overdue ?? 0}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">overdue</p>
                </div>
              </div>

              {/* Open incidents */}
              {(data?.open_incidents?.length ?? 0) > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Open Self-Dealing Incidents</h3>
                  <div className="space-y-2">
                    {data?.open_incidents.map((inc: any) => (
                      <div key={inc.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.status === 'confirmed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 font-medium">{inc.disqualified_person_name}</p>
                          <p className="text-xs text-gray-500">{inc.transaction_type?.replace(/_/g, ' ')} · {inc.incident_date}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${inc.status === 'confirmed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                          {inc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming deadlines */}
              {(data?.upcoming_deadlines?.length ?? 0) > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Upcoming Deadlines</h3>
                  <div className="space-y-2">
                    {data?.upcoming_deadlines.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 font-medium">
                            {f.filing_type?.replace(/_/g, '-').toUpperCase()} · {f.jurisdiction !== 'federal' ? f.jurisdiction.toUpperCase() : 'Federal'}
                          </p>
                          <p className="text-xs text-gray-500">Due {f.due_date} · TY {f.tax_year}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.urgency === 'critical' ? 'bg-red-100 text-red-800' : f.urgency === 'high' ? 'bg-orange-100 text-orange-800' : f.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
                          {f.days_until_due}d
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!data?.open_incidents?.length && !data?.upcoming_deadlines?.length && !loading) && (
                <div className="text-center py-10 text-gray-400 text-sm">
                  No open issues. Compliance looks good!
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'payout' && (
        <PayoutTracker portfolioId={portfolioId} taxYear={currentYear} />
      )}

      {activeTab === 'disqualified' && (
        <DisqualifiedPersonsRegistry orgId={orgId} />
      )}

      {activeTab === 'filings' && (
        <FilingCalendar orgId={orgId} />
      )}

      {activeTab === 'states' && (
        <StateRegistrationTracker orgId={orgId} />
      )}

      {activeTab === 'er' && (
        <ExpenditureResponsibilityList portfolioId={portfolioId} />
      )}
    </div>
  );
}
