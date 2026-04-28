"use client";

import Link from "next/link";

interface OrgHeaderProps {
  org: {
    id: string;
    name: string;
    logo_url?: string | null;
    org_type?: string | null;
    website?: string | null;
  };
  membersCount: number;
  modulesCount: number;
  userRole: string;
}

const ORG_TYPE_LABELS: Record<string, string> = {
  foundation: "Foundation",
  nonprofit: "Nonprofit",
  daf: "Donor Advised Fund",
  family_office: "Family Office",
  corporate: "Corporate",
};

export default function OrgHeader({
  org,
  membersCount,
  modulesCount,
  userRole,
}: OrgHeaderProps) {
  const orgTypeLabel = org.org_type ? ORG_TYPE_LABELS[org.org_type] || org.org_type : null;

  return (
    <div className="flex items-start justify-between gap-4 pb-6 border-b border-black/5">
      <div className="flex items-start gap-4">
        {/* Logo or placeholder */}
        {org.logo_url ? (
          <img
            src={org.logo_url}
            alt={`${org.name} logo`}
            className="w-14 h-14 rounded-xl object-cover border border-black/5"
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-azure/20 to-azure/5 border border-azure/10 flex items-center justify-center">
            <span className="text-2xl font-semibold text-azure">
              {org.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">{org.name}</h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-neutral-600">
            {orgTypeLabel && (
              <>
                <span className="px-2 py-0.5 rounded-full bg-azure/10 text-azure text-xs font-medium">
                  {orgTypeLabel}
                </span>
                <span className="text-neutral-300">|</span>
              </>
            )}
            <span>{membersCount} member{membersCount !== 1 ? "s" : ""}</span>
            <span className="text-neutral-300">|</span>
            <span>{modulesCount} module{modulesCount !== 1 ? "s" : ""} enabled</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {org.website && (
          <a
            href={org.website}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title="Visit website"
          >
            <GlobeIcon className="w-5 h-5 text-neutral-500" />
          </a>
        )}
        {(userRole === "admin" || userRole === "owner") && (
          <Link
            href={`/org/${org.id}/settings`}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title="Settings"
          >
            <CogIcon className="w-5 h-5 text-neutral-500" />
          </Link>
        )}
      </div>
    </div>
  );
}

function GlobeIcon({ className }: { className?: string }) {
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
        d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
      />
    </svg>
  );
}

function CogIcon({ className }: { className?: string }) {
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
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
