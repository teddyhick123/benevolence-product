"use client";

import type { ModuleId } from "@/lib/modules/types";

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: "up" | "down" | null;
  icon?: React.ReactNode;
}

function KpiCard({ label, value, subtext, trend, icon }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-soft p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-600">{label}</span>
        {icon && <span className="text-neutral-400">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {subtext && (
        <div className="text-xs text-neutral-500 flex items-center gap-1">
          {trend && (
            <span className={trend === "up" ? "text-green-600" : "text-red-600"}>
              {trend === "up" ? "+" : "-"}
            </span>
          )}
          {subtext}
        </div>
      )}
    </div>
  );
}

interface OrgKpiRowProps {
  stats: {
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
  };
  loading?: boolean;
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return `$${amount.toLocaleString()}`;
}

export default function OrgKpiRow({ stats, loading = false }: OrgKpiRowProps) {
  const enabledModules = stats.enabled_modules;

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-black/5 shadow-soft p-4 h-24 animate-pulse"
          >
            <div className="h-3 w-20 bg-neutral-200 rounded mb-2" />
            <div className="h-7 w-16 bg-neutral-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const kpis: KpiCardProps[] = [];

  // Always show team members
  kpis.push({
    label: "Team Members",
    value: stats.members_count,
    icon: <UsersIcon className="w-4 h-4" />,
  });

  // Donor management KPIs
  if (enabledModules.includes("donor_management")) {
    kpis.push({
      label: "Total Donors",
      value: stats.donors_count || 0,
      subtext:
        stats.new_donors_this_month && stats.new_donors_this_month > 0
          ? `${stats.new_donors_this_month} new this month`
          : undefined,
      trend: stats.new_donors_this_month && stats.new_donors_this_month > 0 ? "up" : null,
      icon: <HeartIcon className="w-4 h-4" />,
    });

    kpis.push({
      label: "YTD Contributions",
      value: formatCurrency(stats.ytd_contributions || 0),
      icon: <CurrencyIcon className="w-4 h-4" />,
    });

    if ((stats.pending_receipts || 0) > 0) {
      kpis.push({
        label: "Pending Receipts",
        value: stats.pending_receipts || 0,
        subtext: "awaiting action",
        icon: <DocumentIcon className="w-4 h-4" />,
      });
    }
  }

  // Grant management KPIs
  if (enabledModules.includes("grant_management")) {
    kpis.push({
      label: "Active Grants",
      value: stats.active_grants || 0,
      icon: <ClipboardIcon className="w-4 h-4" />,
    });

    if ((stats.upcoming_deadlines || 0) > 0) {
      kpis.push({
        label: "Upcoming Deadlines",
        value: stats.upcoming_deadlines || 0,
        subtext: "in next 30 days",
        icon: <CalendarIcon className="w-4 h-4" />,
      });
    }
  }

  // Impact tracking KPIs
  if (enabledModules.includes("impact_tracking")) {
    kpis.push({
      label: "Impact Metrics",
      value: stats.active_metrics || 0,
      icon: <ChartIcon className="w-4 h-4" />,
    });
  }

  // Core: linked holdings
  if ((stats.linked_holdings || 0) > 0) {
    kpis.push({
      label: "Linked Holdings",
      value: stats.linked_holdings || 0,
      icon: <LinkIcon className="w-4 h-4" />,
    });
  }

  // Limit to 4 KPIs on the main row
  const displayKpis = kpis.slice(0, 4);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {displayKpis.map((kpi, i) => (
        <KpiCard key={i} {...kpi} />
      ))}
    </div>
  );
}

// Icon components
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
    </svg>
  );
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M9.653 16.915l-.005-.003-.019-.01a20.759 20.759 0 01-1.162-.682 22.045 22.045 0 01-2.582-1.9C4.045 12.733 2 10.352 2 7.5a4.5 4.5 0 018-2.828A4.5 4.5 0 0118 7.5c0 2.852-2.044 5.233-3.885 6.82a22.049 22.049 0 01-3.744 2.582l-.019.01-.005.003h-.002a.739.739 0 01-.69.001l-.002-.001z" />
    </svg>
  );
}

function CurrencyIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.75 10.818v2.614A3.13 3.13 0 0011.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 00-1.138-.432zM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 00-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.202.592.037.051.08.102.128.152z" />
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-6a.75.75 0 01.75.75v.316a3.78 3.78 0 011.653.713c.426.33.744.74.925 1.2a.75.75 0 01-1.395.55 1.35 1.35 0 00-.447-.563 2.187 2.187 0 00-.736-.363V9.3c.698.093 1.383.32 1.959.696.787.514 1.29 1.27 1.29 2.13 0 .86-.504 1.616-1.29 2.13-.576.377-1.261.603-1.96.696v.299a.75.75 0 11-1.5 0v-.3a3.78 3.78 0 01-1.653-.713 2.833 2.833 0 01-.925-1.199.75.75 0 011.395-.55c.12.303.343.577.447.563.208.16.46.284.736.363v-2.719c-.698-.093-1.383-.32-1.959-.696-.787-.514-1.29-1.27-1.29-2.13 0-.86.504-1.616 1.29-2.13.576-.377 1.261-.603 1.96-.696V4.75A.75.75 0 0110 4z" clipRule="evenodd" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm2 3.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
      <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
    </svg>
  );
}
