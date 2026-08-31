'use client';

import { useAiUsageReport } from '@/lib/ai/hooks';

const money = (value: number | string) =>
  Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const STATE_MESSAGE: Record<string, string> = {
  uncapped: 'No limit set for this organization.',
  under: '',
  warn: 'Approaching your monthly limit.',
  over: 'Monthly limit reached.',
};

/**
 * What the platform spent on this organization's behalf, against its limit,
 * and what the organization spent on its own key. The two are separate
 * because only the first is capped: the second is their provider bill.
 */
export default function AIUsagePanel({ orgId }: { orgId: string }) {
  const { data, error, isLoading } = useAiUsageReport(orgId);
  if (isLoading) return <div className="card p-6 text-sm text-gray-500">Loading usage…</div>;
  if (error || !data) return <div className="card p-6 text-sm text-red-700">Usage could not be loaded.</div>;

  const { cap, report } = data;
  const peak = Math.max(...report.daily.map(day => Number(day.platform_cost ?? 0)), 1);
  const stateMessage = STATE_MESSAGE[cap.state] ?? '';

  return (
    <section className="card space-y-4 p-6">
      <div>
        <h2 className="text-lg font-semibold">AI usage</h2>
        <p className="text-sm text-gray-500">
          Since {new Date(cap.periodStart).toLocaleDateString()}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Platform-funded</div>
          <div className="text-xl font-semibold">
            {money(report.platform_cost)}
            {cap.effectiveLimitUsd !== null && ` of ${money(cap.effectiveLimitUsd)}`}
          </div>
          {stateMessage && <div className="text-xs text-gray-600">{stateMessage}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Your own key</div>
          <div className="text-xl font-semibold">{money(report.org_cost)}</div>
          <div className="text-xs text-gray-600">Not capped — billed by your provider.</div>
        </div>
      </div>

      {/* own_key can quietly become read-only when the fallback deployment is
          unverified, so where execution moved to is stated rather than left to
          be discovered. */}
      {cap.state === 'over' && cap.onLimit === 'own_key' && (
        <p className="rounded border border-sunset/40 bg-sunset/10 px-3 py-2 text-xs text-gray-800">
          Limit reached — the assistant has switched to your own model. Write access
          depends on that deployment being verified; an unverified model stays read-only.
        </p>
      )}

      {report.by_workload.length > 0 && (
        <div className="space-y-1 border-t pt-3">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Platform spend by workload
          </div>
          {report.by_workload.map(row => (
            <div key={row.workload_id} className="flex justify-between text-sm">
              <span>{row.workload_id}</span>
              <span>{money(row.cost)}</span>
            </div>
          ))}
        </div>
      )}

      {report.daily.length > 0 && (
        <div className="border-t pt-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Daily</div>
          <div className="flex items-end gap-0.5" aria-label="Daily platform spend">
            {report.daily.map(day => (
              <div
                key={day.day}
                className="w-2 bg-azure/60"
                style={{ height: `${Math.max((Number(day.platform_cost ?? 0) / peak) * 40, 2)}px` }}
                title={`${new Date(day.day).toLocaleDateString()}: ${money(day.platform_cost ?? 0)}`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
