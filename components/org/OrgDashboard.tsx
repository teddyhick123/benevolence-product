"use client";

import Link from "next/link";
import { OrgRole } from "@/lib/roles";

interface Props {
  org: {
    id: string;
    name: string;
    ein: string | null;
    website: string | null;
    description: string | null;
  };
  role: OrgRole;
  holdings: any[];
  pendingFacts: any[];
  recentFacts: any[];
}

export default function OrgDashboard({
  org,
  role,
  holdings,
  pendingFacts,
  recentFacts,
}: Props) {
  const verifiedHoldings = holdings.filter((h) => h.verified_at);
  const pendingHoldings = holdings.filter((h) => !h.verified_at);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{org.name}</h1>
          {org.ein && (
            <p className="text-sm text-neutral-500">EIN: {org.ein}</p>
          )}
        </div>
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-azure hover:underline"
          >
            Visit Website
          </a>
        )}
      </div>

      {org.description && (
        <p className="text-neutral-600">{org.description}</p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-neutral-500 mb-1">Linked Holdings</div>
          <div className="text-2xl font-semibold">{verifiedHoldings.length}</div>
          {pendingHoldings.length > 0 && (
            <div className="text-xs text-amber-600 mt-1">
              {pendingHoldings.length} pending verification
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="text-sm text-neutral-500 mb-1">Pending Metrics</div>
          <div className="text-2xl font-semibold">{pendingFacts.length}</div>
          <div className="text-xs text-neutral-500 mt-1">
            Awaiting portfolio owner approval
          </div>
        </div>

        <div className="card p-4">
          <div className="text-sm text-neutral-500 mb-1">Approved Metrics</div>
          <div className="text-2xl font-semibold">{recentFacts.length}+</div>
          <div className="text-xs text-neutral-500 mt-1">
            Visible in portfolios
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-4">
        <h2 className="font-medium mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {(role === "admin" || role === "editor") && (
            <>
              <Link
                href={`/org/${org.id}/data`}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm shadow-soft hover:opacity-90 transition"
              >
                Submit Metrics
              </Link>
              <Link
                href={`/org/${org.id}/data`}
                className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-white transition"
              >
                Upload Report
              </Link>
            </>
          )}
          {role === "admin" && (
            <>
              <Link
                href={`/org/${org.id}/members`}
                className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-white transition"
              >
                Manage Team
              </Link>
              <Link
                href={`/org/${org.id}/settings`}
                className="px-4 py-2 rounded-lg border border-black/10 text-sm hover:bg-white transition"
              >
                Settings
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Linked Holdings */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Linked Holdings</h2>
          {role === "admin" && (
            <Link
              href={`/org/${org.id}/settings`}
              className="text-sm text-azure hover:underline"
            >
              Request new link
            </Link>
          )}
        </div>

        {verifiedHoldings.length === 0 && pendingHoldings.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No holdings linked yet. Request a link from Settings.
          </p>
        ) : (
          <div className="space-y-2">
            {verifiedHoldings.map((h) => (
              <div
                key={h.holding_id}
                className="flex items-center justify-between py-2 border-b border-black/5 last:border-0"
              >
                <div>
                  <div className="font-medium text-sm">{h.holdings?.name}</div>
                  <div className="text-xs text-neutral-500">
                    {h.holdings?.portfolios?.name || "Portfolio"}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                  Verified
                </span>
              </div>
            ))}
            {pendingHoldings.map((h) => (
              <div
                key={h.holding_id}
                className="flex items-center justify-between py-2 border-b border-black/5 last:border-0"
              >
                <div>
                  <div className="font-medium text-sm">{h.holdings?.name}</div>
                  <div className="text-xs text-neutral-500">
                    {h.holdings?.portfolios?.name || "Portfolio"}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                  Pending
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Metrics */}
        <div className="card p-4">
          <h2 className="font-medium mb-3">Pending Approval</h2>
          {pendingFacts.length === 0 ? (
            <p className="text-sm text-neutral-500">No pending metrics.</p>
          ) : (
            <div className="space-y-2">
              {pendingFacts.slice(0, 5).map((fact) => (
                <div
                  key={fact.id}
                  className="py-2 border-b border-black/5 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {fact.metrics?.name || fact.metric_code}
                    </span>
                    <span className="text-sm font-mono">
                      {fact.value?.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {fact.holdings?.name} •{" "}
                    {fact.period_end
                      ? new Date(fact.period_end).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
              ))}
              {pendingFacts.length > 5 && (
                <Link
                  href={`/org/${org.id}/data`}
                  className="text-sm text-azure hover:underline block pt-2"
                >
                  View all {pendingFacts.length} pending
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent Approved */}
        <div className="card p-4">
          <h2 className="font-medium mb-3">Recently Approved</h2>
          {recentFacts.length === 0 ? (
            <p className="text-sm text-neutral-500">No approved metrics yet.</p>
          ) : (
            <div className="space-y-2">
              {recentFacts.slice(0, 5).map((fact) => (
                <div
                  key={fact.id}
                  className="py-2 border-b border-black/5 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {fact.metrics?.name || fact.metric_code}
                    </span>
                    <span className="text-sm font-mono">
                      {fact.value?.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {fact.holdings?.name} •{" "}
                    {fact.period_end
                      ? new Date(fact.period_end).toLocaleDateString()
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
