"use client";

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ModuleId } from "@/lib/modules/types";
import {
  OrgHeader,
  OrgKpiRow,
  OrgActivityFeed,
  OrgQuickActions,
  OrgModuleCard,
  OrgGettingStarted,
} from "@/components/org";

interface OrgData {
  id: string;
  name: string;
  logo_url?: string | null;
  description?: string | null;
  ein?: string | null;
  org_type?: string | null;
  website?: string | null;
  created_at?: string | null;
}

interface ModuleData {
  id: ModuleId;
  name: string;
  description: string;
  href: string;
}

interface DashboardStats {
  members_count: number;
  enabled_modules: ModuleId[];
  donors_count?: number;
  ytd_contributions?: number;
  pending_receipts?: number;
  new_donors_this_month?: number;
  active_grants?: number;
  upcoming_deadlines?: number;
  active_metrics?: number;
  linked_holdings?: number;
}

interface ActivityItem {
  id: string;
  type: "contribution" | "donor" | "member" | "receipt" | "grant" | "metric";
  description: string;
  timestamp: string;
  actor?: string;
  link?: string;
  amount?: number;
}

interface SetupProgress {
  tasks: { id: string; label: string; completed: boolean }[];
  completed_count: number;
  total_count: number;
}

interface DashboardResponse {
  org: OrgData;
  stats: DashboardStats;
  recent_activity: ActivityItem[];
  setup_progress: SetupProgress | null;
  user_role: string;
}

interface Props {
  orgId: string;
  initialOrg: OrgData;
  enabledModules: ModuleId[];
  moduleData: ModuleData[];
  userRole: string;
}

export default function OrgDashboardClient({
  orgId,
  initialOrg,
  enabledModules,
  moduleData,
  userRole,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await apiRequest(`/api/org/${orgId}/dashboard`);
        if (!res.ok) {
          throw new Error("Failed to load dashboard data");
        }
        const data = await readJson(res);
        setDashboardData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [orgId]);

  const stats = dashboardData?.stats || {
    members_count: 0,
    enabled_modules: enabledModules,
  };

  const nonCoreModulesCount = enabledModules.filter((m) => m !== "core").length;

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <OrgHeader
        org={initialOrg}
        membersCount={stats.members_count}
        modulesCount={nonCoreModulesCount}
        userRole={userRole}
      />

      {/* Getting Started (for new orgs) */}
      {dashboardData?.setup_progress && (
        <div id="getting-started-section">
          <OrgGettingStarted
            orgId={orgId}
            progress={dashboardData.setup_progress}
            userRole={userRole}
          />
        </div>
      )}

      {/* KPI Row */}
      <OrgKpiRow stats={stats} loading={loading} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Activity & Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <OrgQuickActions
            orgId={orgId}
            enabledModules={enabledModules}
            userRole={userRole}
          />

          {/* Activity Feed */}
          <OrgActivityFeed
            activities={dashboardData?.recent_activity || []}
            orgId={orgId}
            loading={loading}
          />
        </div>

        {/* Right column - Modules */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-medium text-neutral-900">Your Modules</h3>
            {(userRole === "admin" || userRole === "owner") && (
              <Link
                href={`/builder-studio?org_id=${encodeURIComponent(orgId)}#modules`}
                className="text-sm text-azure hover:underline"
              >
                Manage
              </Link>
            )}
          </div>

          {moduleData.length === 0 ? (
            <div className="bg-white rounded-xl border border-black/5 shadow-soft p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                <CubeIcon className="w-6 h-6 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-600 mb-3">No modules enabled yet.</p>
              {(userRole === "admin" || userRole === "owner") && (
                <Link
                  href={`/builder-studio?org_id=${encodeURIComponent(orgId)}#modules`}
                  className="inline-block px-4 py-2 bg-azure text-white text-sm rounded-lg hover:bg-azure/90 transition-colors"
                >
                  Enable Modules
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {moduleData.map((module) => (
                <OrgModuleCard
                  key={module.id}
                  moduleId={module.id}
                  moduleName={module.name}
                  moduleDescription={module.description}
                  href={module.href}
                  stats={stats}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-sm text-red-700 underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  );
}
