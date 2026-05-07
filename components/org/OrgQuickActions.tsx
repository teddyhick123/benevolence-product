"use client";

import Link from "next/link";
import type { ModuleId } from "@/lib/modules/types";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ReactNode;
  module?: ModuleId; // If set, only show when this module is enabled
  primary?: boolean;
  adminOnly?: boolean;
}

interface OrgQuickActionsProps {
  orgId: string;
  enabledModules: ModuleId[];
  userRole: string;
}

export default function OrgQuickActions({
  orgId,
  enabledModules,
  userRole,
}: OrgQuickActionsProps) {
  const isAdmin = userRole === "admin" || userRole === "owner";
  const canEdit = isAdmin || userRole === "editor";

  const allActions: QuickAction[] = [
    // Donor management actions
    {
      label: "Log Contribution",
      href: `/org/${orgId}/contributions/new`,
      icon: <PlusCircleIcon className="w-5 h-5" />,
      module: "donor_management",
      primary: true,
    },
    {
      label: "Add Donor",
      href: `/org/${orgId}/donors/new`,
      icon: <UserPlusIcon className="w-5 h-5" />,
      module: "donor_management",
    },
    {
      label: "Generate Receipt",
      href: `/org/${orgId}/receipts`,
      icon: <ReceiptIcon className="w-5 h-5" />,
      module: "donor_management",
    },
    // Reporting actions
    {
      label: "View Reports",
      href: `/dashboard/reports?org_id=${orgId}`,
      icon: <DocumentChartIcon className="w-5 h-5" />,
      module: "reporting",
    },
    // Analytics actions
    {
      label: "View Analytics",
      href: `/dashboard/analytics?org_id=${orgId}`,
      icon: <ChartBarIcon className="w-5 h-5" />,
      module: "analytics",
    },
    // Grant management actions
    {
      label: "Manage Grants",
      href: `/dashboard/grants?org_id=${orgId}`,
      icon: <ClipboardDocumentIcon className="w-5 h-5" />,
      module: "grant_management",
    },
    // Core actions (always available)
    {
      label: "Team Members",
      href: `/org/${orgId}/members`,
      icon: <UsersIcon className="w-5 h-5" />,
    },
    {
      label: "Manage Modules",
      href: `/org/${orgId}/settings/modules`,
      icon: <CubeIcon className="w-5 h-5" />,
      adminOnly: true,
    },
    {
      label: "Settings",
      href: `/org/${orgId}/settings`,
      icon: <CogIcon className="w-5 h-5" />,
      adminOnly: true,
    },
  ];

  // Filter actions based on modules and permissions
  const visibleActions = allActions.filter((action) => {
    // Check module requirement
    if (action.module && !enabledModules.includes(action.module)) {
      return false;
    }
    // Check admin requirement
    if (action.adminOnly && !isAdmin) {
      return false;
    }
    // If not admin/editor, hide editing actions
    if (!canEdit && action.primary) {
      return false;
    }
    return true;
  });

  // Limit to 6 actions
  const displayActions = visibleActions.slice(0, 6);

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-soft p-5">
      <h3 className="text-base font-medium text-neutral-900 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {displayActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow ${
              action.primary
                ? "bg-gradient-to-r from-azure to-azure/90 text-white border-azure hover:from-azure/90 hover:to-azure/80"
                : "bg-white border-black/10 text-neutral-700 hover:border-azure/30 hover:text-azure"
            }`}
          >
            <span className={action.primary ? "text-white/90" : "text-neutral-500"}>
              {action.icon}
            </span>
            <span className="text-sm font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Icon components
function PlusCircleIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
    </svg>
  );
}

function UserPlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm12 4a3 3 0 11-6 0 3 3 0 016 0zM4 9a1 1 0 100-2 1 1 0 000 2zm13-1a1 1 0 11-2 0 1 1 0 012 0zM1.75 14.5a.75.75 0 000 1.5c4.417 0 8.693.603 12.749 1.73 1.111.309 2.251-.512 2.251-1.696v-.784a.75.75 0 00-1.5 0v.784a.272.272 0 01-.35.25A49.043 49.043 0 001.75 14.5z" clipRule="evenodd" />
    </svg>
  );
}

function DocumentChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm4.75 6.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zm2.5 1.5a.75.75 0 00-1.5 0v4a.75.75 0 001.5 0v-4zm2.5-1.5a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5z" clipRule="evenodd" />
    </svg>
  );
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
    </svg>
  );
}

function ClipboardDocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M15.988 3.012A2.25 2.25 0 0118 5.25v6.5A2.25 2.25 0 0115.75 14H13.5V7A2.5 2.5 0 0011 4.5H8.128a2.252 2.252 0 011.884-1.488A2.25 2.25 0 0112.25 1h1.5a2.25 2.25 0 012.238 2.012zM11.5 3.25a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v.25h-3v-.25z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M2 7a1 1 0 011-1h8a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7zm2 3.25a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75zm0 3.5a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
    </svg>
  );
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10 1L3 5v10l7 4 7-4V5l-7-4zM4.5 5.866L10 3l5.5 2.866v8.268L10 17l-5.5-2.866V5.866z" />
      <path d="M10 7L5 9.5V15l5-2.5V7z" />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l.962.962a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-.125 1.262l-.962.962a1 1 0 01-1.262.125l-1.25-.834a6.953 6.953 0 01-1.416.587l-.294 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125l-.962-.962a1 1 0 01-.125-1.262l.834-1.25a6.957 6.957 0 01-.587-1.416l-1.473-.294A1 1 0 011 10.68V9.32a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262l.962-.962A1 1 0 015.38 3.05l1.25.834a6.957 6.957 0 011.416-.587l.294-1.473zM13 10a3 3 0 11-6 0 3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  );
}
