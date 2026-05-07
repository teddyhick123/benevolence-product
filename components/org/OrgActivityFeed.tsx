"use client";

import Link from "next/link";

interface ActivityItem {
  id: string;
  type: "contribution" | "donor" | "member" | "receipt" | "grant" | "metric";
  description: string;
  timestamp: string;
  actor?: string;
  link?: string;
  amount?: number;
}

interface OrgActivityFeedProps {
  activities: ActivityItem[];
  orgId: string;
  loading?: boolean;
}

const TYPE_ICONS: Record<ActivityItem["type"], string> = {
  contribution: "$",
  donor: "+",
  member: "@",
  receipt: "#",
  grant: "G",
  metric: "M",
};

const TYPE_COLORS: Record<ActivityItem["type"], string> = {
  contribution: "bg-green-100 text-green-700",
  donor: "bg-azure/10 text-azure",
  member: "bg-purple-100 text-purple-700",
  receipt: "bg-amber-100 text-amber-700",
  grant: "bg-blue-100 text-blue-700",
  metric: "bg-teal-100 text-teal-700",
};

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function OrgActivityFeed({
  activities,
  orgId,
  loading = false,
}: OrgActivityFeedProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-32 bg-neutral-200 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-neutral-200 animate-pulse" />
              <div className="flex-1">
                <div className="h-4 w-48 bg-neutral-200 rounded animate-pulse" />
                <div className="h-3 w-20 bg-neutral-100 rounded animate-pulse mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-black/5 shadow-soft p-5">
        <h3 className="text-base font-medium text-neutral-900 mb-4">Recent Activity</h3>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
            <ClockIcon className="w-6 h-6 text-neutral-400" />
          </div>
          <p className="text-sm text-neutral-600">No recent activity yet.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Activity will appear here as you add donors and contributions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-black/5 shadow-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium text-neutral-900">Recent Activity</h3>
        <Link
          href={`/org/${orgId}/activity`}
          className="text-sm text-azure hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="space-y-3">
        {activities.slice(0, 8).map((activity) => (
          <div
            key={activity.id}
            className="flex items-start gap-3 py-2 border-b border-black/5 last:border-0 last:pb-0"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${TYPE_COLORS[activity.type]}`}
            >
              {TYPE_ICONS[activity.type]}
            </div>
            <div className="flex-1 min-w-0">
              {activity.link ? (
                <Link
                  href={activity.link}
                  className="text-sm text-neutral-900 hover:text-azure line-clamp-2"
                >
                  {activity.description}
                </Link>
              ) : (
                <p className="text-sm text-neutral-900 line-clamp-2">{activity.description}</p>
              )}
              <p className="text-xs text-neutral-500 mt-0.5">
                {formatRelativeTime(activity.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClockIcon({ className }: { className?: string }) {
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
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
