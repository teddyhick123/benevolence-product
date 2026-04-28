'use client';

import { useState, useEffect } from 'react';

interface GrantHealth {
  grant_id: string;
  grant_name: string;
  health_score: number;
  risk_level: string;
  milestones_overdue: number;
  reports_overdue: number;
  grant_period_end: string | null;
}

interface Alert {
  id: string;
  tier: 'critical' | 'warning';
  message: string;
  grants: { id: string; name: string }[];
}

interface Props {
  grants: GrantHealth[];
  portfolioId: string;
}

const SESSION_KEY = 'grant_dismissed_alerts';

function getDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...ids]));
  } catch {}
}

function buildAlerts(grants: GrantHealth[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // Critical: health < 50
  const lowHealth = grants.filter((g) => g.health_score < 50);
  if (lowHealth.length > 0) {
    alerts.push({
      id: 'critical_health',
      tier: 'critical',
      message: `${lowHealth.length} grant${lowHealth.length > 1 ? 's have' : ' has'} a critical health score (below 50)`,
      grants: lowHealth.map((g) => ({ id: g.grant_id, name: g.grant_name })),
    });
  }

  // Critical: overdue milestones
  const overdueMilestones = grants.filter((g) => (g.milestones_overdue || 0) > 0);
  if (overdueMilestones.length > 0) {
    const total = overdueMilestones.reduce((s, g) => s + g.milestones_overdue, 0);
    alerts.push({
      id: 'overdue_milestones',
      tier: 'critical',
      message: `${total} overdue milestone${total > 1 ? 's' : ''} across ${overdueMilestones.length} grant${overdueMilestones.length > 1 ? 's' : ''}`,
      grants: overdueMilestones.map((g) => ({ id: g.grant_id, name: g.grant_name })),
    });
  }

  // Critical: overdue reports
  const overdueReports = grants.filter((g) => (g.reports_overdue || 0) > 0);
  if (overdueReports.length > 0) {
    const total = overdueReports.reduce((s, g) => s + g.reports_overdue, 0);
    alerts.push({
      id: 'overdue_reports',
      tier: 'critical',
      message: `${total} overdue report${total > 1 ? 's' : ''} across ${overdueReports.length} grant${overdueReports.length > 1 ? 's' : ''}`,
      grants: overdueReports.map((g) => ({ id: g.grant_id, name: g.grant_name })),
    });
  }

  // Warning: health between 50-70
  const mediumHealth = grants.filter((g) => g.health_score >= 50 && g.health_score < 70);
  if (mediumHealth.length > 0) {
    alerts.push({
      id: 'warning_health',
      tier: 'warning',
      message: `${mediumHealth.length} grant${mediumHealth.length > 1 ? 's' : ''} ${mediumHealth.length > 1 ? 'have' : 'has'} a health score below 70`,
      grants: mediumHealth.map((g) => ({ id: g.grant_id, name: g.grant_name })),
    });
  }

  // Warning: grant period ending within 7 days
  const nearExpiry = grants.filter((g) => {
    if (!g.grant_period_end) return false;
    const end = new Date(g.grant_period_end);
    const diff = end.getTime() - now.getTime();
    return diff > 0 && diff <= sevenDaysMs;
  });
  if (nearExpiry.length > 0) {
    alerts.push({
      id: 'near_expiry',
      tier: 'warning',
      message: `${nearExpiry.length} grant${nearExpiry.length > 1 ? 's expire' : ' expires'} within 7 days`,
      grants: nearExpiry.map((g) => ({ id: g.grant_id, name: g.grant_name })),
    });
  }

  return alerts;
}

export default function RiskAlerts({ grants, portfolioId }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(getDismissed());
  }, []);

  const alerts = buildAlerts(grants).filter((a) => !dismissed.has(a.id));

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    saveDismissed(next);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (grants.length === 0) return null;

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="font-medium">All grants on track</span>
        <span className="text-green-600">No active risk alerts.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert) => {
        const isCritical = alert.tier === 'critical';
        const isExpanded = expanded.has(alert.id);

        return (
          <div
            key={alert.id}
            className={`rounded-lg border px-4 py-3 ${
              isCritical
                ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <svg
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isCritical ? 'text-red-500' : 'text-amber-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={isCritical
                      ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                      : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}
                  />
                </svg>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>
                    {alert.message}
                  </p>
                  {isExpanded && (
                    <ul className="mt-2 space-y-1">
                      {alert.grants.map((g) => (
                        <li key={g.id}>
                          <a
                            href={`/dashboard/grants/${g.id}?portfolio_id=${portfolioId}`}
                            className={`text-xs underline ${isCritical ? 'text-red-700 hover:text-red-900' : 'text-amber-700 hover:text-amber-900'}`}
                          >
                            {g.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {alert.grants.length > 0 && (
                    <button
                      onClick={() => toggleExpand(alert.id)}
                      className={`mt-1 text-xs underline ${isCritical ? 'text-red-600' : 'text-amber-600'}`}
                    >
                      {isExpanded ? 'Hide grants' : `View ${alert.grants.length} grant${alert.grants.length > 1 ? 's' : ''}`}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDismiss(alert.id)}
                className={`flex-shrink-0 p-1 rounded ${isCritical ? 'text-red-400 hover:text-red-600' : 'text-amber-400 hover:text-amber-600'}`}
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
