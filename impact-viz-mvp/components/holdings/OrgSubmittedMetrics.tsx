"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StagedFact {
  id: string;
  metric_code: string;
  value: number;
  unit?: string;
  period_end?: string;
  source?: string;
  created_at: string;
  metrics?: { name: string; unit?: string } | null;
  organizations?: { name: string } | null;
}

interface Props {
  holdingId: string;
  pendingFacts: StagedFact[];
  linkedOrg: { id: string; name: string } | null;
}

export default function OrgSubmittedMetrics({ holdingId, pendingFacts, linkedOrg }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approveFact(factId: string) {
    setLoading(factId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/staged-facts/${factId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function rejectFact(factId: string) {
    if (!confirm("Are you sure you want to reject this metric?")) return;

    setLoading(factId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/staged-facts/${factId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function approveAll() {
    for (const fact of pendingFacts) {
      await approveFact(fact.id);
    }
  }

  if (!linkedOrg && pendingFacts.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-neutral-700">Organization Updates</h3>
          {linkedOrg && (
            <p className="text-xs text-neutral-500">
              Linked to: <span className="font-medium">{linkedOrg.name}</span>
            </p>
          )}
        </div>
        {pendingFacts.length > 1 && (
          <button
            onClick={approveAll}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            Approve All ({pendingFacts.length})
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {pendingFacts.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No pending metrics from the organization.
        </p>
      ) : (
        <div className="space-y-3">
          {pendingFacts.map((fact) => (
            <div
              key={fact.id}
              className="p-4 rounded-xl border border-amber-200 bg-amber-50/50"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium text-azure">
                      {fact.metrics?.name || fact.metric_code}
                    </span>
                    <span className="text-lg font-semibold text-neutral-900">
                      {fact.value?.toLocaleString()}
                    </span>
                    {(fact.unit || fact.metrics?.unit) && (
                      <span className="text-sm text-neutral-500">
                        {fact.unit || fact.metrics?.unit}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-600 space-x-3">
                    {fact.period_end && (
                      <span>
                        Period: {new Date(fact.period_end).toLocaleDateString()}
                      </span>
                    )}
                    {fact.source && <span>Source: {fact.source}</span>}
                    <span>
                      Submitted: {new Date(fact.created_at).toLocaleDateString()}
                    </span>
                    {fact.organizations?.name && (
                      <span>From: {fact.organizations.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveFact(fact.id)}
                    disabled={loading === fact.id}
                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {loading === fact.id ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={() => rejectFact(fact.id)}
                    disabled={loading === fact.id}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!linkedOrg && pendingFacts.length > 0 && (
        <p className="mt-4 text-xs text-neutral-500">
          These metrics were submitted by an organization. You can link this
          holding to an organization for ongoing updates.
        </p>
      )}
    </section>
  );
}
