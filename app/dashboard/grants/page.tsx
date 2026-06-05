'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { type LifecycleStage } from '@/lib/grants/lifecycle-shared';
import WorkflowManager from '@/components/grants/WorkflowManager';
import PaymentSchedule from '@/components/grants/PaymentSchedule';
import CommunicationLog from '@/components/grants/CommunicationLog';
import CreateGrantWizard from '@/components/grants/CreateGrantWizard';
import GrantPipelineView, { type GrantListItem } from '@/components/grants/GrantPipelineView';
import GrantTableView from '@/components/grants/GrantTableView';
import GrantCalendarView from '@/components/grants/GrantCalendarView';
import GrantAttentionQueue from '@/components/grants/GrantAttentionQueue';
import BulkActionBar, { type QueuedTransitions } from '@/components/grants/BulkActionBar';
import BulkDecisionQueue, { type BulkTransitionItem } from '@/components/grants/BulkDecisionQueue';
import BulkTransitionResultModal, { type BulkResult } from '@/components/grants/BulkTransitionResultModal';

type ViewId = 'pipeline' | 'table' | 'calendar' | 'attention' | 'workflows' | 'payments' | 'communications';

interface OrgMember { id: string; display_name?: string | null; email?: string | null }

export default function GrantsDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewId>('pipeline');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showWizard, setShowWizard] = useState(false);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllInStage(stage: LifecycleStage, ids: string[]) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  // Bulk apply flow state
  type BulkPhase = 'idle' | 'confirm' | 'decisions' | 'applying' | 'result';
  const [bulkPhase, setBulkPhase] = useState<BulkPhase>('idle');
  const [queuedTransitions, setQueuedTransitions] = useState<QueuedTransitions>({});
  const [bulkResults, setBulkResults] = useState<{ successCount: number; failureCount: number; results: BulkResult[] } | null>(null);

  async function handleApplyTransitions(queued: QueuedTransitions) {
    setQueuedTransitions(queued);
    const { requiresDecision } = await import('@/lib/grants/lifecycle');
    const needsDecision = grants.some(g => {
      const target = queued[g.lifecycle_stage];
      return target && selectedIds.has(g.id) && requiresDecision(g.lifecycle_stage, target);
    });
    setBulkPhase(needsDecision ? 'decisions' : 'confirm');
  }

  async function executeBulkTransitions(items: BulkTransitionItem[]) {
    if (!orgId) return;
    setBulkPhase('applying');

    const body = {
      transitions: items.map(item => ({
        grantId: item.grantId,
        expectedFromStage: item.fromStage,
        targetStage: item.targetStage,
        decision: item.decision,
      })),
    };

    try {
      const res = await fetch(`/api/org/${orgId}/grants/bulk-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setBulkPhase('idle');
        return;
      }

      // Optimistic: update local grant stages for successes
      const successIds = new Set(data.results.filter((r: any) => r.success).map((r: any) => r.grantId));
      setGrants(prev =>
        prev.map(g => {
          if (!successIds.has(g.id)) return g;
          const item = items.find(i => i.grantId === g.id);
          return item ? { ...g, lifecycle_stage: item.targetStage } : g;
        })
      );

      // Enrich results with grant names from the items we sent
      const nameByGrantId = new Map(items.map(i => [i.grantId, i.grantName]));
      const enriched: BulkResult[] = data.results.map((r: any) => ({
        ...r,
        grantName: nameByGrantId.get(r.grantId),
      }));

      setBulkResults({ successCount: data.successCount, failureCount: data.failureCount, results: enriched });
      setBulkPhase('result');
      setRefreshKey(k => k + 1);
    } catch {
      setBulkPhase('idle');
    }
  }

  function handleDecisionQueueConfirm(items: BulkTransitionItem[]) {
    executeBulkTransitions(items);
  }

  function handleSimpleConfirm() {
    const items: BulkTransitionItem[] = grants
      .filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage])
      .map(g => ({
        grantId: g.id,
        grantName: g.holdings?.name ?? 'Unnamed Grant',
        fromStage: g.lifecycle_stage,
        targetStage: queuedTransitions[g.lifecycle_stage] as LifecycleStage,
        amount: g.approved_amount ?? g.requested_amount,
      }));
    executeBulkTransitions(items);
  }

  function closeBulkResult() {
    setBulkResults(null);
    setBulkPhase('idle');
    exitSelectionMode();
  }

  // Grant list data (shared across pipeline/table/attention views)
  const [grants, setGrants] = useState<GrantListItem[]>([]);
  const [grantsLoading, setGrantsLoading] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const json = await res.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
          setOrgId(json.organization_id || null);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // Sync view from URL
  useEffect(() => {
    const view = searchParams.get('view') as ViewId | null;
    if (view && ['pipeline','table','calendar','attention','workflows','payments','communications'].includes(view)) {
      setActiveView(view);
    }
  }, [searchParams]);

  // Fetch grants list when orgId+portfolioId available
  useEffect(() => {
    if (!orgId || !portfolioId) return;
    setGrantsLoading(true);
    Promise.all([
      fetch(`/api/org/${orgId}/grants?portfolio_id=${encodeURIComponent(portfolioId)}&page_size=200`).then(r => r.json()),
      fetch(`/api/org/${orgId}/members`).then(r => r.json()).catch(() => ({ members: [] })),
    ]).then(([grantsJson, membersJson]) => {
      setGrants(grantsJson.data ?? []);
      // Normalize to {id: user_id, display_name} so owner filter matches grants.internal_owner_id
      const raw: any[] = membersJson.members ?? membersJson.data ?? [];
      setMembers(raw.map(m => ({ id: m.user_id ?? m.id, display_name: m.full_name ?? m.email })));
    }).finally(() => setGrantsLoading(false));
  }, [orgId, portfolioId, refreshKey]);

  function handleViewChange(view: ViewId) {
    if (view !== 'pipeline') exitSelectionMode();
    setActiveView(view);
  }

  const views: { id: ViewId; label: string; icon: React.ReactNode; group: 'center' | 'ops' }[] = [
    {
      id: 'pipeline',
      label: 'Pipeline',
      group: 'center',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      id: 'table',
      label: 'Table',
      group: 'center',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'calendar',
      label: 'Calendar',
      group: 'center',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      id: 'attention',
      label: 'Attention',
      group: 'center',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    {
      id: 'workflows',
      label: 'Workflows',
      group: 'ops',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'payments',
      label: 'Payments',
      group: 'ops',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'communications',
      label: 'Communications',
      group: 'ops',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
  ];

  // Counts for attention badge
  const attentionCount = grants.filter(g => {
    const d = g.grant_period_end ? Math.round((new Date(g.grant_period_end).getTime() - Date.now()) / 86_400_000) : null;
    return (g.risk_level === 'high' || g.risk_level === 'critical') || (d !== null && d < 0);
  }).length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="mb-4 h-8 w-1/4 rounded-2xl bg-neutral-200"></div>
          <div className="mb-8 h-4 w-1/2 rounded-2xl bg-neutral-200"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-neutral-200"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioId || !orgId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="mt-2 font-serif text-lg font-medium text-ink">No Portfolio Found</h3>
          <p className="mt-1 text-sm text-neutral-600">Please select a portfolio and organization to view grant management.</p>
        </div>
      </div>
    );
  }

  const centerViews = views.filter(v => v.group === 'center');
  const opsViews = views.filter(v => v.group === 'ops');

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 ${selectionMode ? 'pb-36' : ''}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-ink">Grant Management</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {grantsLoading ? 'Loading…' : `${grants.length} grant${grants.length !== 1 ? 's' : ''} · Track lifecycle, obligations, and payments`}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {activeView === 'pipeline' && !selectionMode && (
            <button
              onClick={enterSelectionMode}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow will-change-transform"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 11l3 3L22 4M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Select
            </button>
          )}
          {activeView === 'pipeline' && selectionMode && (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-azure/20 bg-azure/5 px-4 py-2 text-sm font-medium text-azure">
              <span>{selectedIds.size} selected</span>
              <button
                onClick={exitSelectionMode}
                className="ml-2 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
              >
                Exit
              </button>
            </div>
          )}
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Grant
          </button>
          <a
            href={`/dashboard?portfolio_id=${portfolioId}`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow will-change-transform rm:transition-none rm:transform-none"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </a>
        </div>
      </div>

      {/* Navigation */}
      <div className="rounded-2xl border border-black/5 bg-white p-1.5 shadow-soft overflow-x-auto">
        <nav className="flex gap-1 min-w-max" aria-label="Grant views">
          <span className="self-center px-2 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 whitespace-nowrap">Views</span>
          {centerViews.map(view => (
            <button
              key={view.id}
              onClick={() => handleViewChange(view.id)}
              className={`group relative inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                activeView === view.id
                  ? 'bg-azure text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-azure/5 hover:text-azure'
              }`}
            >
              <span className={activeView === view.id ? 'text-white' : 'text-neutral-400 group-hover:text-azure'}>
                {view.icon}
              </span>
              {view.label}
              {view.id === 'attention' && attentionCount > 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                  {attentionCount}
                </span>
              )}
            </button>
          ))}
          <span className="flex-1 min-w-4" />
          <span className="self-center px-2 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 whitespace-nowrap">Operations</span>
          {opsViews.map(view => (
            <button
              key={view.id}
              onClick={() => handleViewChange(view.id)}
              className={`group inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                activeView === view.id
                  ? 'bg-azure text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-azure/5 hover:text-azure'
              }`}
            >
              <span className={activeView === view.id ? 'text-white' : 'text-neutral-400 group-hover:text-azure'}>
                {view.icon}
              </span>
              {view.label}
            </button>
          ))}
        </nav>
      </div>

      {/* View content */}
      <div className="min-h-[400px]">
        {activeView === 'pipeline' && (
          <GrantPipelineView
            grants={grants}
            loading={grantsLoading}
            onNewGrant={() => setShowWizard(true)}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAllInStage={selectAllInStage}
          />
        )}
        {activeView === 'table' && (
          <GrantTableView
            grants={grants}
            loading={grantsLoading}
            members={members}
            onNewGrant={() => setShowWizard(true)}
          />
        )}
        {activeView === 'calendar' && (
          <GrantCalendarView
            orgId={orgId}
            portfolioId={portfolioId}
            key={`calendar-${refreshKey}`}
          />
        )}
        {activeView === 'attention' && (
          <GrantAttentionQueue
            grants={grants}
            loading={grantsLoading}
            onNewGrant={() => setShowWizard(true)}
          />
        )}
        {activeView === 'workflows' && (
          <WorkflowManager orgId={orgId} portfolioId={portfolioId} key={`workflows-${refreshKey}`} />
        )}
        {activeView === 'payments' && (
          <PaymentSchedule portfolioId={portfolioId} key={`payments-${refreshKey}`} />
        )}
        {activeView === 'communications' && (
          <CommunicationLog portfolioId={portfolioId} key={`comms-${refreshKey}`} />
        )}
      </div>

      {/* Bulk selection action bar */}
      {activeView === 'pipeline' && selectionMode && selectedIds.size > 0 && bulkPhase === 'idle' && (
        <BulkActionBar
          grants={grants}
          selectedIds={selectedIds}
          onApply={handleApplyTransitions}
          onCancel={exitSelectionMode}
        />
      )}

      {/* Simple confirmation dialog */}
      {bulkPhase === 'confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h2 className="text-base font-semibold text-ink mb-2">Apply transitions?</h2>
            <p className="text-sm text-neutral-500 mb-5">
              {grants.filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage]).length} grant
              {grants.filter(g => selectedIds.has(g.id) && queuedTransitions[g.lifecycle_stage]).length !== 1 ? 's' : ''} will be moved.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBulkPhase('idle')} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
                Back
              </button>
              <button
                onClick={handleSimpleConfirm}
                className="px-5 py-2 rounded-2xl bg-azure text-white text-sm font-medium shadow-soft hover:opacity-90 transition-opacity"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision queue modal */}
      {bulkPhase === 'decisions' && (
        <BulkDecisionQueue
          grants={grants.filter(g => selectedIds.has(g.id))}
          queuedTransitions={queuedTransitions}
          onConfirm={handleDecisionQueueConfirm}
          onCancel={() => setBulkPhase('idle')}
        />
      )}

      {/* Applying spinner */}
      {bulkPhase === 'applying' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-6 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-azure border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-ink">Applying transitions…</span>
          </div>
        </div>
      )}

      {/* Result modal */}
      {bulkPhase === 'result' && bulkResults && (
        <BulkTransitionResultModal
          successCount={bulkResults.successCount}
          failureCount={bulkResults.failureCount}
          results={bulkResults.results}
          onClose={closeBulkResult}
        />
      )}

      {/* Create Grant Wizard */}
      {showWizard && orgId && portfolioId && (
        <CreateGrantWizard
          orgId={orgId}
          portfolioId={portfolioId}
          onClose={() => setShowWizard(false)}
          onSuccess={(grantId) => {
            setShowWizard(false);
            setRefreshKey(k => k + 1);
            router.push(`/dashboard/grants/${grantId}`);
          }}
        />
      )}
    </div>
  );
}
