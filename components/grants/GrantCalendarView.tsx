'use client';

import { requestJson } from "@/lib/api/client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

interface CalendarEvent {
  id: string;
  grant_id?: string;
  holding_id?: string;
  title: string;
  event_type: 'milestone' | 'report' | 'payment' | 'renewal' | 'closeout' | 'period_end';
  due_date: string;
  grantee_name: string;
  priority?: string | null;
}

interface Props {
  orgId: string;
  portfolioId: string;
}

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  milestone:  { bg: 'bg-azure/10',  text: 'text-azure-deep', dot: 'bg-azure' },
  report:     { bg: 'bg-sunset/15', text: 'text-ink',        dot: 'bg-sunset' },
  payment:    { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  renewal:    { bg: 'bg-sunset/15', text: 'text-ink',        dot: 'bg-sunset' },
  closeout:   { bg: 'bg-coral/10',  text: 'text-coral',      dot: 'bg-coral' },
  period_end: { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
};

const EVENT_LABELS: Record<string, string> = {
  milestone: 'Milestone', report: 'Report Due', payment: 'Payment',
  renewal: 'Renewal', closeout: 'Closeout', period_end: 'Period End',
};

function groupByMonth(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const d = new Date(e.due_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return map;
}

function formatMonthKey(key: string): string {
  const [year, month] = key.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayOfMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default function GrantCalendarView({ orgId, portfolioId }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const json = await requestJson<{ events?: CalendarEvent[] }>(
          `/api/org/${orgId}/grants/calendar?portfolio_id=${encodeURIComponent(portfolioId)}`
        );
        setEvents(json.events ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orgId, portfolioId]);

  const filtered = useMemo(() => {
    const evs = typeFilter ? events.filter(e => e.event_type === typeFilter) : events;
    return [...evs].sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [events, typeFilter]);

  const byMonth = useMemo(() => groupByMonth(filtered), [filtered]);
  const months = useMemo(() => [...byMonth.keys()].sort(), [byMonth]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse">
            <div className="h-5 w-32 bg-neutral-200 rounded mb-3" />
            <div className="space-y-2">
              {[1, 2].map(j => <div key={j} className="h-12 bg-neutral-100 rounded-2xl" />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="rounded-2xl bg-red-50 text-red-700 p-4 text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {(['', 'milestone', 'report', 'payment', 'renewal', 'closeout', 'period_end'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              typeFilter === t
                ? 'bg-azure text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {t === '' ? 'All' : EVENT_LABELS[t]}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-400">{filtered.length} upcoming event{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {months.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-azure/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-ink">No upcoming events</p>
            <p className="text-sm text-neutral-500 mt-1">
              Events appear here once grants have milestones, reports, or payments scheduled.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {months.map(monthKey => {
            const monthEvents = byMonth.get(monthKey)!;
            return (
              <div key={monthKey}>
                <h3 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-azure" />
                  {formatMonthKey(monthKey)}
                  <span className="font-normal text-neutral-400">· {monthEvents.length}</span>
                </h3>

                <div className="space-y-2">
                  {monthEvents.map(ev => {
                    const colors = EVENT_TYPE_COLORS[ev.event_type] ?? EVENT_TYPE_COLORS.milestone;
                    const days = daysUntil(ev.due_date);
                    const isOverdue = days < 0;
                    const isUrgent = days >= 0 && days <= 7;

                    return (
                      <div
                        key={ev.id}
                        className={`flex items-start gap-3 rounded-2xl border p-3 transition-shadow hover:shadow-sm ${
                          isOverdue ? 'border-red-200 bg-red-50/50' : 'border-black/5 bg-white'
                        }`}
                      >
                        {/* Date pill */}
                        <div className="shrink-0 text-center min-w-[40px]">
                          <div className="text-xs font-semibold text-neutral-500">{dayOfMonth(ev.due_date)}</div>
                        </div>

                        {/* Type dot */}
                        <div className="mt-1 shrink-0">
                          <span className={`w-2 h-2 rounded-full block ${colors.dot}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${colors.bg} ${colors.text}`}>
                              {EVENT_LABELS[ev.event_type]}
                            </span>
                            {isOverdue && (
                              <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700 font-medium">
                                {Math.abs(days)}d overdue
                              </span>
                            )}
                            {isUrgent && !isOverdue && (
                              <span className="text-xs rounded-full px-2 py-0.5 bg-sunset/15 text-ink font-medium">
                                Due soon
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-ink truncate">{ev.title}</p>
                          <p className="text-xs text-neutral-400">{ev.grantee_name}</p>
                        </div>

                        {ev.grant_id && (
                          <Link
                            href={`/dashboard/grants/${ev.grant_id}`}
                            className="shrink-0 text-xs text-azure hover:underline"
                          >
                            View →
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
