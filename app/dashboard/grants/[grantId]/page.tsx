'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DocumentManager from '@/components/grants/DocumentManager';
import BudgetTracker from '@/components/grants/BudgetTracker';
import GrantExportButton from '@/components/grants/GrantExportButton';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import { GRANT_RISK_BADGE, grantStageBadgeClass, grantStageLabel } from '@/components/grants/grantPalette';

type WorkspaceSection = 'overview' | 'milestones' | 'decisions' | 'history' | 'tasks' | 'contacts' | 'communications' | 'documents' | 'budget';

function fmt(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | null | undefined, currency = 'USD') {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function GrantDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const grantId = params.grantId as string;
  const portfolioId = searchParams.get('portfolio_id');

  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionTo, setTransitionTo] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const load = useCallback(async (oid: string) => {
    try {
      const mainRes = await fetch(`/api/org/${oid}/grants/${grantId}`);
      if (!mainRes.ok) return;
      const mainData = await mainRes.json();
      setData(mainData);

      const holdingId = mainData?.grant?.holding_id;
      const [decisionsRes, contactsRes, milestonesRes] = await Promise.all([
        fetch(`/api/org/${oid}/grants/${grantId}/decisions`),
        fetch(`/api/org/${oid}/grants/${grantId}/contacts`).catch(() => ({ ok: false, json: async () => ({ data: [] }) })),
        holdingId && portfolioId
          ? fetch(`/api/portfolio/${portfolioId}/holdings/${holdingId}/milestones`).catch(() => ({ ok: false, json: async () => ({ data: [] }) }))
          : Promise.resolve({ ok: true, json: async () => ({ data: [] }) }),
      ]);

      if (decisionsRes.ok) setDecisions((await decisionsRes.json()).data ?? []);
      if ((contactsRes as any).ok) setContacts((await (contactsRes as any).json()).data ?? []);
      if ((milestonesRes as any).ok) setMilestones((await (milestonesRes as any).json()).data ?? []);
    } catch {
      // ignore
    }
  }, [grantId, portfolioId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const meRes = await fetch('/api/me');
        if (!meRes.ok) return;
        const me = await meRes.json();
        const oid = me.organization_id ?? null;
        if (!oid) return;
        setOrgId(oid);

        const mainRes = await fetch(`/api/org/${oid}/grants/${grantId}`);
        if (!mainRes.ok) return;
        const mainData = await mainRes.json();
        setData(mainData);

        const holdingId = mainData?.grant?.holding_id;
        const [decisionsRes, contactsRes, milestonesRes] = await Promise.all([
          fetch(`/api/org/${oid}/grants/${grantId}/decisions`),
          fetch(`/api/org/${oid}/grants/${grantId}/contacts`).catch(() => ({ ok: false, json: async () => ({ data: [] }) })),
          holdingId && portfolioId
            ? fetch(`/api/portfolio/${portfolioId}/holdings/${holdingId}/milestones`).catch(() => ({ ok: false, json: async () => ({ data: [] }) }))
            : Promise.resolve({ ok: true, json: async () => ({ data: [] }) }),
        ]);
        if (decisionsRes.ok) setDecisions((await decisionsRes.json()).data ?? []);
        if ((contactsRes as any).ok) setContacts((await (contactsRes as any).json()).data ?? []);
        if ((milestonesRes as any).ok) setMilestones((await (milestonesRes as any).json()).data ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [grantId]);

  async function handleTransition() {
    if (!orgId || !transitionTo) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/grants/${grantId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_stage: transitionTo, reason: transitionReason || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      setTransitionTo('');
      setTransitionReason('');
      await load(orgId);
    } catch (err: any) {
      setTransitionError(err?.message ?? 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-200 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  const grant = data?.grant;
  const health = data?.health;
  const tasks: any[] = data?.tasks ?? [];
  const payments: any[] = data?.payments ?? [];
  const communications: any[] = data?.communications ?? [];
  const history: any[] = data?.history ?? [];

  if (!grant) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h3 className="text-lg font-medium text-gray-900">Grant Not Found</h3>
        <Link href="/dashboard/grants" className="mt-4 inline-flex items-center text-sm text-azure hover:text-azure/80">&larr; Back to Grants</Link>
      </div>
    );
  }

  const currentStage: LifecycleStage = grant.lifecycle_stage ?? 'draft';
  const stageIndex = LIFECYCLE_STAGES.indexOf(currentStage as any);
  const terminalStages = new Set(['closed', 'declined', 'cancelled']);
  const isTerminal = terminalStages.has(currentStage);

  const SECTIONS: { id: WorkspaceSection; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'milestones', label: `Milestones` },
    { id: 'decisions', label: `Decisions${decisions.length ? ` (${decisions.length})` : ''}` },
    { id: 'tasks', label: `Tasks${tasks.length ? ` (${tasks.length})` : ''}` },
    { id: 'history', label: 'Activity' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'communications', label: 'Communications' },
    { id: 'documents', label: 'Documents' },
    { id: 'budget', label: 'Budget' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Breadcrumb + header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/dashboard/grants" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-2xl font-serif text-gray-900">{grant.holdings?.name ?? '—'}</h1>
            <span className={grantStageBadgeClass(currentStage)}>
              {grantStageLabel(currentStage)}
            </span>
            {grant.risk_level && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${GRANT_RISK_BADGE[grant.risk_level] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
                {grant.risk_level} risk
              </span>
            )}
          </div>
          {grant.purpose && (
            <p className="mt-1 text-sm text-gray-500 max-w-xl">{grant.purpose}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {portfolioId && <GrantExportButton portfolioId={portfolioId} grantId={grantId} />}
          <Link
            href={`/dashboard/holdings/${grant.holding_id}?portfolio_id=${portfolioId ?? ''}`}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Holding
          </Link>
        </div>
      </div>

      {/* Lifecycle header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Requested</div>
              <div className="text-lg font-bold text-gray-900">{fmtMoney(grant.requested_amount, grant.currency)}</div>
            </div>
            {grant.approved_amount && (
              <div>
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Approved</div>
                <div className="text-lg font-bold text-green-700">{fmtMoney(grant.approved_amount, grant.currency)}</div>
              </div>
            )}
            {grant.grant_period_end && (
              <div>
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Period End</div>
                <div className="text-sm font-medium text-gray-700">{fmt(grant.grant_period_end)}</div>
              </div>
            )}
            {health?.health_score != null && (
              <div>
                <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Health</div>
                <div className={`text-lg font-bold ${health.health_score >= 80 ? 'text-green-600' : health.health_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {health.health_score}<span className="text-sm font-normal text-gray-400">/100</span>
                </div>
              </div>
            )}
          </div>

          {/* Transition form */}
          {!isTerminal && orgId && (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={transitionTo}
                onChange={e => setTransitionTo(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-azure/30"
              >
                <option value="">Move to stage…</option>
                {LIFECYCLE_STAGES.filter(s => s !== currentStage).map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
              {transitionTo && (
                <input
                  value={transitionReason}
                  onChange={e => setTransitionReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 w-44"
                />
              )}
              {transitionTo && (
                <button
                  onClick={handleTransition}
                  disabled={transitioning}
                  className="px-4 py-1.5 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 transition-colors disabled:opacity-50"
                >
                  {transitioning ? 'Moving…' : 'Confirm'}
                </button>
              )}
            </div>
          )}
        </div>
        {transitionError && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{transitionError}</div>
        )}
      </div>

      {/* Health grid */}
      {health && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Milestones', val: `${health.milestones_completed}/${health.total_milestones}`, sub: health.milestones_overdue > 0 ? `${health.milestones_overdue} overdue` : null, subClass: 'text-red-500' },
            { label: 'Reports', val: `${health.reports_submitted}/${health.total_reports}`, sub: health.reports_overdue > 0 ? `${health.reports_overdue} overdue` : null, subClass: 'text-red-500' },
            { label: 'Disbursed', val: fmtMoney(health.total_disbursed), sub: health.payments_pending > 0 ? `${health.payments_pending} pending` : null, subClass: 'text-amber-500' },
            { label: 'Workflows', val: health.active_workflows, sub: health.workflow_tasks_pending > 0 ? `${health.workflow_tasks_pending} tasks open` : null, subClass: 'text-gray-400' },
          ].map(({ label, val, sub, subClass }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-soft p-4">
              <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</div>
              <div className="text-xl font-bold text-gray-900 mt-1">{val}</div>
              {sub && <div className={`text-xs mt-0.5 ${subClass}`}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex space-x-6 min-w-max">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`py-3 px-1 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                activeSection === id ? 'border-azure text-azure' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Section content */}

      {/* OVERVIEW */}
      {activeSection === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Grant Details</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-gray-400">Type</dt><dd className="text-gray-900 font-medium capitalize">{grant.grant_type?.replace(/_/g, ' ') ?? '—'}</dd></div>
                <div><dt className="text-gray-400">Period</dt><dd className="text-gray-900 font-medium">{fmt(grant.grant_period_start)} – {fmt(grant.grant_period_end)}</dd></div>
                <div><dt className="text-gray-400">Reporting</dt><dd className="text-gray-900 font-medium capitalize">{grant.reporting_frequency ?? '—'}</dd></div>
                <div><dt className="text-gray-400">Renewal</dt><dd className="text-gray-900 font-medium">{grant.renewal_eligible ? 'Eligible' : 'Not eligible'}</dd></div>
                <div><dt className="text-gray-400">Currency</dt><dd className="text-gray-900 font-medium">{grant.currency ?? 'USD'}</dd></div>
                <div><dt className="text-gray-400">Grantee</dt><dd className="text-gray-900 font-medium">{grant.holdings?.name ?? '—'}</dd></div>
                {grant.holdings?.ein && (
                  <div><dt className="text-gray-400">EIN</dt><dd className="text-gray-900 font-medium font-mono text-xs">{grant.holdings.ein}</dd></div>
                )}
              </dl>
            </div>
          </div>
          <div className="space-y-4">
            {/* Recent activity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Activity</h3>
              {history.length === 0 ? (
                <p className="text-sm text-gray-400">No activity yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.slice(0, 5).map((h: any) => (
                    <li key={h.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-azure mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="text-gray-600">{h.from_stage ? `${h.from_stage.replace(/_/g, ' ')} → ` : 'Created as '}</span>
                        <span className="font-medium text-gray-900">{h.to_stage.replace(/_/g, ' ')}</span>
                        {h.reason && <span className="text-gray-400 ml-1">— {h.reason}</span>}
                        <div className="text-gray-300 mt-0.5">{fmt(h.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* Open tasks */}
            {tasks.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Open Tasks</h3>
                <ul className="space-y-2">
                  {tasks.filter((t: any) => t.tasks?.status !== 'completed').slice(0, 5).map((t: any) => (
                    <li key={t.task_id} className="text-xs">
                      <div className="font-medium text-gray-900">{t.tasks?.title}</div>
                      {t.tasks?.due_at && <div className="text-gray-400">Due {fmt(t.tasks.due_at)}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MILESTONES */}
      {activeSection === 'milestones' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Milestones</h2>
            <span className="text-xs text-gray-400">{milestones.length} total</span>
          </div>
          {milestones.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No milestones defined.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {milestones.map((m: any) => (
                <li key={m.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{m.milestone_name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${m.status === 'completed' ? 'bg-green-100 text-green-700' : m.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {m.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {m.description && <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-400 flex-shrink-0">
                      <div>Due {fmt(m.due_date)}</div>
                      {m.completed_date && <div className="text-green-600">Done {fmt(m.completed_date)}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* DECISIONS */}
      {activeSection === 'decisions' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Decisions</h2>
          </div>
          {decisions.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No decisions recorded.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {decisions.map((d: any) => (
                <li key={d.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.decision === 'approved' ? 'border border-green-200 bg-green-100 text-green-700' : d.decision === 'declined' ? 'border border-red-200 bg-red-100 text-red-700' : 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
                          {d.decision}
                        </span>
                        <span className="text-sm text-gray-600 capitalize">{d.decision_type?.replace(/_/g, ' ')}</span>
                      </div>
                      {d.rationale && <p className="text-xs text-gray-500 mt-1">{d.rationale}</p>}
                      {d.conditions && <p className="text-xs text-amber-600 mt-1">Conditions: {d.conditions}</p>}
                      {d.amount && <p className="text-xs text-gray-700 mt-1">Amount: {fmtMoney(d.amount)}</p>}
                    </div>
                    <div className="text-right text-xs text-gray-400 flex-shrink-0">
                      <div>{fmt(d.decision_date)}</div>
                      {d.board_meeting_date && <div>Board: {fmt(d.board_meeting_date)}</div>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* TASKS */}
      {activeSection === 'tasks' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Linked Tasks</h2>
          </div>
          {tasks.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No tasks linked to this grant.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {tasks.map((t: any) => (
                <li key={t.task_id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.tasks?.priority === 'urgent' ? 'bg-red-500' : t.tasks?.priority === 'high' ? 'bg-coral' : 'bg-neutral-300'}`} />
                        <span className="text-sm font-medium text-gray-900">{t.tasks?.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${t.tasks?.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {t.tasks?.status?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">{t.tasks?.due_at ? fmt(t.tasks.due_at) : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ACTIVITY HISTORY */}
      {activeSection === 'history' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Lifecycle History</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No history yet.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {history.map((h: any) => (
                <li key={h.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-azure/10 text-azure flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">→</div>
                    <div>
                      <div className="text-sm">
                        {h.from_stage && <span className="text-gray-500">{h.from_stage.replace(/_/g, ' ')} → </span>}
                        <span className="font-semibold text-gray-900">{h.to_stage.replace(/_/g, ' ')}</span>
                      </div>
                      {h.reason && <p className="text-xs text-gray-500 mt-0.5">{h.reason}</p>}
                      <div className="text-xs text-gray-300 mt-1">{fmt(h.created_at)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* CONTACTS */}
      {activeSection === 'contacts' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Grant Contacts</h2>
          </div>
          {contacts.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No contacts on file.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {contacts.map((c: any) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="text-sm font-medium text-gray-900">{c.name}</div>
                  {c.role && <div className="text-xs text-gray-500">{c.role}</div>}
                  {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* COMMUNICATIONS */}
      {activeSection === 'communications' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Communications</h2>
            <span className="text-xs text-gray-400">{communications.length} entries</span>
          </div>
          {communications.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">No communications logged.</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {communications.map((c: any) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${c.direction === 'inbound' ? 'bg-azure/10 text-azure-deep' : 'bg-green-100 text-green-600'}`}>
                      {c.direction === 'inbound' ? '↓' : '↑'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 capitalize">{c.comm_type?.replace(/_/g, ' ')}{c.contact_name && ` — ${c.contact_name}`}</div>
                      {c.subject && <div className="text-xs text-gray-600 mt-0.5">{c.subject}</div>}
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.summary}</p>
                      <div className="text-xs text-gray-300 mt-1">{fmt(c.occurred_at)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* DOCUMENTS */}
      {activeSection === 'documents' && (
        portfolioId
          ? <DocumentManager grantId={grantId} portfolioId={portfolioId} />
          : <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center text-sm text-gray-400">Documents are available when viewing this grant from within a portfolio.</div>
      )}

      {/* BUDGET */}
      {activeSection === 'budget' && (
        portfolioId
          ? <BudgetTracker grantId={grantId} portfolioId={portfolioId} />
          : <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-8 text-center text-sm text-gray-400">Budget tracking is available when viewing this grant from within a portfolio.</div>
      )}
    </div>
  );
}
