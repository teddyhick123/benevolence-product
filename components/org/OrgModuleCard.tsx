"use client";

import Link from "next/link";
import type { ModuleId } from "@/lib/modules/types";

interface ModuleStats {
  donors_count?: number;
  ytd_contributions?: number;
  active_grants?: number;
  active_metrics?: number;
  pending_receipts?: number;
}

interface OrgModuleCardProps {
  moduleId: ModuleId;
  moduleName: string;
  moduleDescription: string;
  href: string;
  stats?: ModuleStats;
}

const MODULE_ICONS: Record<string, React.ReactNode> = {
  impact_tracking: <ChartIcon className="w-6 h-6" />,
  reporting: <DocumentIcon className="w-6 h-6" />,
  tax_optimization: <CalculatorIcon className="w-6 h-6" />,
  grant_management: <ClipboardIcon className="w-6 h-6" />,
  donor_management: <HeartIcon className="w-6 h-6" />,
  external_data: <GlobeIcon className="w-6 h-6" />,
  analytics: <TrendingIcon className="w-6 h-6" />,
};

const MODULE_COLORS: Record<string, string> = {
  impact_tracking: "from-teal-500/20 to-teal-500/5 border-teal-500/20",
  reporting: "from-blue-500/20 to-blue-500/5 border-blue-500/20",
  tax_optimization: "from-amber-500/20 to-amber-500/5 border-amber-500/20",
  grant_management: "from-purple-500/20 to-purple-500/5 border-purple-500/20",
  donor_management: "from-rose-500/20 to-rose-500/5 border-rose-500/20",
  external_data: "from-cyan-500/20 to-cyan-500/5 border-cyan-500/20",
  analytics: "from-indigo-500/20 to-indigo-500/5 border-indigo-500/20",
};

function getModuleMetric(moduleId: ModuleId, stats?: ModuleStats): { label: string; value: string } | null {
  if (!stats) return null;

  switch (moduleId) {
    case "donor_management":
      if (stats.donors_count !== undefined) {
        return { label: "donors", value: stats.donors_count.toLocaleString() };
      }
      break;
    case "grant_management":
      if (stats.active_grants !== undefined) {
        return { label: "active", value: stats.active_grants.toLocaleString() };
      }
      break;
    case "impact_tracking":
      if (stats.active_metrics !== undefined) {
        return { label: "metrics", value: stats.active_metrics.toLocaleString() };
      }
      break;
    case "reporting":
      return { label: "reports", value: "View" };
    case "analytics":
      return { label: "insights", value: "View" };
    default:
      return null;
  }
  return null;
}

export default function OrgModuleCard({
  moduleId,
  moduleName,
  moduleDescription,
  href,
  stats,
}: OrgModuleCardProps) {
  const icon = MODULE_ICONS[moduleId] || <CubeIcon className="w-6 h-6" />;
  const colorClass = MODULE_COLORS[moduleId] || "from-neutral-500/20 to-neutral-500/5 border-neutral-500/20";
  const metric = getModuleMetric(moduleId, stats);

  return (
    <Link
      href={href}
      className="group block bg-white rounded-xl border border-black/5 shadow-soft overflow-hidden hover:border-azure/30 hover:shadow-md transition-all hover:-translate-y-0.5"
    >
      {/* Gradient header */}
      <div className={`h-2 bg-gradient-to-r ${colorClass}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-neutral-600 group-hover:text-azure transition-colors">
                {icon}
              </div>
              <h3 className="font-semibold text-neutral-900 group-hover:text-azure transition-colors">
                {moduleName}
              </h3>
            </div>
            <p className="text-sm text-neutral-600 line-clamp-2">{moduleDescription}</p>
          </div>

          {/* Metric badge */}
          {metric && (
            <div className="flex-shrink-0 text-right">
              <div className="text-lg font-semibold text-neutral-900">{metric.value}</div>
              <div className="text-xs text-neutral-500">{metric.label}</div>
            </div>
          )}
        </div>

        {/* Status indicators */}
        {moduleId === "donor_management" && stats?.pending_receipts && stats.pending_receipts > 0 && (
          <div className="mt-3 pt-3 border-t border-black/5">
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {stats.pending_receipts} receipt{stats.pending_receipts !== 1 ? "s" : ""} pending
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// Icon components
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function TrendingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}
