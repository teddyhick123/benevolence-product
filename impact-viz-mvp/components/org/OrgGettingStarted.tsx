"use client";

import Link from "next/link";

interface SetupTask {
  id: string;
  label: string;
  completed: boolean;
}

interface SetupProgress {
  tasks: SetupTask[];
  completed_count: number;
  total_count: number;
}

interface OrgGettingStartedProps {
  orgId: string;
  progress: SetupProgress;
  userRole: string;
}

const TASK_LINKS: Record<string, string> = {
  profile: "settings",
  members: "members",
  modules: "settings/modules",
  donor: "donors/new",
  grant: "/dashboard/grants",
};

const TASK_DESCRIPTIONS: Record<string, string> = {
  profile: "Add your organization description and EIN for tax receipts",
  members: "Invite colleagues to help manage your organization",
  modules: "Choose which features to enable for your organization",
  donor: "Start tracking your donor relationships",
  grant: "Create your first grant record to track milestones",
};

export default function OrgGettingStarted({
  orgId,
  progress,
  userRole,
}: OrgGettingStartedProps) {
  const isAdmin = userRole === "admin" || userRole === "owner";
  const completionPercent = Math.round((progress.completed_count / progress.total_count) * 100);

  // Don't show if fully complete
  if (progress.completed_count === progress.total_count) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-azure/5 to-azure/10 rounded-xl border border-azure/20 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Getting Started</h3>
          <p className="text-sm text-neutral-600 mt-1">
            Complete these steps to get the most out of your organization portal.
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-2xl font-bold text-azure">{completionPercent}%</div>
          <div className="text-xs text-neutral-500">complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-white rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-gradient-to-r from-azure to-azure/70 transition-all duration-500"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      {/* Tasks list */}
      <div className="space-y-3">
        {progress.tasks.map((task) => {
          const linkPath = TASK_LINKS[task.id];
          const description = TASK_DESCRIPTIONS[task.id];
          const href = linkPath?.startsWith("/")
            ? linkPath
            : `/org/${orgId}/${linkPath}`;

          return (
            <div
              key={task.id}
              className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                task.completed
                  ? "bg-white/50"
                  : "bg-white hover:bg-white/80"
              }`}
            >
              {/* Checkbox */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  task.completed
                    ? "bg-green-500 border-green-500"
                    : "border-neutral-300"
                }`}
              >
                {task.completed && <CheckIcon className="w-4 h-4 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`font-medium ${
                      task.completed ? "text-neutral-500 line-through" : "text-neutral-900"
                    }`}
                  >
                    {task.label}
                  </span>
                  {!task.completed && isAdmin && linkPath && (
                    <Link
                      href={href}
                      className="text-sm text-azure hover:underline flex-shrink-0"
                    >
                      Start
                    </Link>
                  )}
                </div>
                {description && !task.completed && (
                  <p className="text-sm text-neutral-500 mt-0.5">{description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismiss option */}
      <div className="mt-4 pt-4 border-t border-azure/10 text-center">
        <button
          type="button"
          className="text-sm text-neutral-500 hover:text-neutral-700"
          onClick={() => {
            // Could implement dismissal via localStorage or API
            const el = document.getElementById("getting-started-section");
            if (el) el.style.display = "none";
          }}
        >
          Dismiss for now
        </button>
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}
