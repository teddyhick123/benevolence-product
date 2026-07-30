import { NextRequest } from "next/server";
import { isAccessDenied, requireOrgAccess } from "@/lib/api/access";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { getOrgEnabledModules } from "@/lib/modules";
import type { ModuleId } from "@/lib/modules/types";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

interface DashboardStats {
  members_count: number;
  enabled_modules: ModuleId[];
  // Donor management stats
  donors_count?: number;
  ytd_contributions?: number;
  pending_receipts?: number;
  new_donors_this_month?: number;
  // Grant management stats
  active_grants?: number;
  upcoming_deadlines?: number;
  // Impact tracking stats
  active_metrics?: number;
  // Core stats
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

interface SetupTask {
  id: string;
  label: string;
  completed: boolean;
}

interface WorkbenchHealthIssue {
  id: string;
  label: string;
  count: number;
  severity: "ok" | "warning" | "critical";
  href: string;
}

interface WorkbenchAction {
  id: string;
  label: string;
  description: string;
  href: string;
  priority: "high" | "medium" | "low";
}

interface RecentImport {
  id: string;
  name: string;
  status: string;
  total_records_extracted: number;
  records_loaded: number;
  records_failed: number;
  error_rows: number;
  created_at: string;
}

async function safeCount(
  query: PromiseLike<{ count: number | null; error: any }>
): Promise<number> {
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

function countDuplicateLabels(labels: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const label = raw?.trim().toLowerCase();
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

// GET /api/org/[orgId]/dashboard - Get dashboard data
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId);
  if (isAccessDenied(access)) return access.response;

  try {
    const adminClient = access.context.db;

    // Get organization details
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, name, branding, org_type_config, ein, org_type, website, created_at")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return jsonError("Organization not found", 404);
    }

    // Get enabled modules
    const enabledModules = await getOrgEnabledModules(adminClient, orgId);

    // Get member count
    const { count: membersCount } = await adminClient
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    // Initialize stats
    const stats: DashboardStats = {
      members_count: membersCount || 0,
      enabled_modules: enabledModules,
    };

    // Get holdings owned by this organization (core)
    const { count: holdingsCount } = await adminClient
      .from("holdings")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("deleted_at", null);

    stats.linked_holdings = holdingsCount || 0;

    // Module-specific stats
    const currentYear = new Date().getFullYear();
    const startOfYear = `${currentYear}-01-01`;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];

    // Donor management stats
    if (enabledModules.includes("donor_management")) {
      // Total donors
      const { count: donorsCount } = await adminClient
        .from("donors")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId);

      stats.donors_count = donorsCount || 0;

      // New donors this month
      const { count: newDonorsCount } = await adminClient
        .from("donors")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("created_at", startOfMonth);

      stats.new_donors_this_month = newDonorsCount || 0;

      // YTD contributions
      const { data: ytdData } = await adminClient
        .from("contributions_received")
        .select("amount")
        .eq("org_id", orgId)
        .gte("contribution_date", startOfYear);

      stats.ytd_contributions = ytdData?.reduce((sum, c) => sum + Number(c.amount || 0), 0) || 0;

      // Pending receipts
      const { count: pendingReceiptsCount } = await adminClient
        .from("contributions_received")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("acknowledgment_sent", false);

      stats.pending_receipts = pendingReceiptsCount || 0;
    }

    // Grant management stats — grants now has org_id directly
    if (enabledModules.includes("grant_management")) {
      // Count active grants for this org (active = within grant period or no end date)
      const { count: activeGrantsCount } = await adminClient
        .from("grants")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .or("grant_period_end.is.null,grant_period_end.gte." + new Date().toISOString().split("T")[0]);

      stats.active_grants = activeGrantsCount || 0;

      // Upcoming deadlines (next 30 days) - milestones for this org's grants
      if (activeGrantsCount && activeGrantsCount > 0) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const { count: deadlinesCount } = await adminClient
          .from("grant_milestones")
          .select("*, grants!inner(org_id)", { count: "exact", head: true })
          .eq("grants.org_id", orgId)
          .lte("due_date", thirtyDaysFromNow.toISOString().split("T")[0])
          .gte("due_date", new Date().toISOString().split("T")[0])
          .eq("status", "pending");

        stats.upcoming_deadlines = deadlinesCount || 0;
      }
    }

    // Impact tracking stats
    // metric_facts has submitted_by_org_id for tracking data provenance
    if (enabledModules.includes("impact_tracking")) {
      const { count: metricsCount } = await adminClient
        .from("metric_facts")
        .select("*", { count: "exact", head: true })
        .eq("submitted_by_org_id", orgId);

      stats.active_metrics = metricsCount || 0;
    }

    // Get recent activity
    const activity: ActivityItem[] = [];

    // Recent contributions (if donor_management enabled)
    if (enabledModules.includes("donor_management")) {
      const { data: recentContributions } = await adminClient
        .from("contributions_received")
        .select("id, amount, contribution_date, donors(first_name, last_name, organization_name)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5);

      recentContributions?.forEach((c: any) => {
        const donorName = c.donors
          ? c.donors.organization_name || `${c.donors.first_name} ${c.donors.last_name}`
          : "Anonymous";
        activity.push({
          id: `contribution-${c.id}`,
          type: "contribution",
          description: `$${c.amount?.toLocaleString()} contribution from ${donorName}`,
          timestamp: c.contribution_date,
          amount: c.amount,
          link: `/org/${orgId}/contributions/${c.id}`,
        });
      });

      // Recent donors added
      const { data: recentDonors } = await adminClient
        .from("donors")
        .select("id, first_name, last_name, organization_name, is_organization, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(3);

      recentDonors?.forEach((d: any) => {
        const name = d.organization_name || `${d.first_name} ${d.last_name}`;
        activity.push({
          id: `donor-${d.id}`,
          type: "donor",
          description: `New donor added: ${name}`,
          timestamp: d.created_at,
          link: `/org/${orgId}/donors/${d.id}`,
        });
      });
    }

    // Recent members
    const { data: recentMembers } = await adminClient
      .from("organization_members")
      .select("id, user_id, role, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);

    recentMembers?.forEach((m: any) => {
      activity.push({
        id: `member-${m.id}`,
        type: "member",
        description: `Team member ${m.user_id} joined as ${m.role}`,
        timestamp: m.created_at,
      });
    });

    // Sort activity by timestamp
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Get setup progress for new orgs
    const setupTasks: SetupTask[] = [
      {
        id: "profile",
        label: "Complete organization profile",
        completed: !!(org.org_type_config?.description && org.ein),
      },
      {
        id: "members",
        label: "Invite team members",
        completed: (membersCount || 0) > 1,
      },
      {
        id: "modules",
        label: "Enable modules",
        completed: enabledModules.filter((m) => m !== "core").length > 0,
      },
    ];

    if (enabledModules.includes("donor_management")) {
      setupTasks.push({
        id: "donor",
        label: "Add your first donor",
        completed: (stats.donors_count || 0) > 0,
      });
    }

    if (enabledModules.includes("grant_management")) {
      setupTasks.push({
        id: "grant",
        label: "Create a grant record",
        completed: (stats.active_grants || 0) > 0,
      });
    }

    const completedTasks = setupTasks.filter((t) => t.completed).length;
    const isNewOrg = completedTasks < setupTasks.length;

    const [
      importJobsResult,
      pendingProposalCount,
      workflowConfigCount,
      customFieldCount,
      automationRuleCount,
      aiContextCount,
      viewConfigCount,
      holdingsForHealth,
      donorsForHealth,
    ] = await Promise.all([
      adminClient
        .from("import_jobs")
        .select("id, name, status, total_records_extracted, records_loaded, records_failed, error_rows, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(5),
      safeCount(
        adminClient
          .from("builder_proposals")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("status", "pending")
      ),
      safeCount(
        adminClient
          .from("org_workflow_config")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
      ),
      safeCount(
        adminClient
          .from("org_custom_field_definitions")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("is_active", true)
      ),
      safeCount(
        adminClient
          .from("org_automation_rules")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("is_active", true)
      ),
      safeCount(
        adminClient
          .from("org_ai_context")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("is_active", true)
      ),
      safeCount(
        adminClient
          .from("org_view_config")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
      ),
      adminClient
        .from("holdings")
        .select("id, name, ein")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .limit(1000),
      adminClient
        .from("donors")
        .select("id, first_name, last_name, organization_name, email")
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .limit(1000),
    ]);

    const recentImports: RecentImport[] = Array.isArray(importJobsResult.data)
      ? importJobsResult.data.map((job: any) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          total_records_extracted: job.total_records_extracted || 0,
          records_loaded: job.records_loaded || 0,
          records_failed: job.records_failed || 0,
          error_rows: job.error_rows || 0,
          created_at: job.created_at,
        }))
      : [];

    const holdingsHealthRows = Array.isArray(holdingsForHealth.data) ? holdingsForHealth.data as any[] : [];
    const donorHealthRows = Array.isArray(donorsForHealth.data) ? donorsForHealth.data as any[] : [];
    const missingEinCount = holdingsHealthRows.filter((h) => !String(h.ein || "").trim()).length;
    const duplicateCount =
      countDuplicateLabels(holdingsHealthRows.map((h) => h.name)) +
      countDuplicateLabels(donorHealthRows.map((d) => d.organization_name || [d.first_name, d.last_name].filter(Boolean).join(" ")));
    const failedImportRows = recentImports.reduce((sum, job) => sum + job.records_failed + job.error_rows, 0);
    const reviewImportCount = recentImports.filter((job) => ["needs_review", "failed"].includes(job.status)).length;

    const dataHealthIssues: WorkbenchHealthIssue[] = [
      {
        id: "missing_eins",
        label: "Missing EINs",
        count: missingEinCount,
        severity: missingEinCount > 0 ? "warning" : "ok",
        href: "/dashboard/holdings",
      },
      {
        id: "duplicates",
        label: "Possible duplicates",
        count: duplicateCount,
        severity: duplicateCount > 0 ? "warning" : "ok",
        href: "/dashboard/holdings",
      },
      {
        id: "import_errors",
        label: "Import errors",
        count: failedImportRows,
        severity: failedImportRows > 0 ? "critical" : "ok",
        href: `/org/${orgId}/data`,
      },
      {
        id: "review_imports",
        label: "Imports needing review",
        count: reviewImportCount,
        severity: reviewImportCount > 0 ? "warning" : "ok",
        href: `/org/${orgId}/data`,
      },
    ];

    const nextActions: WorkbenchAction[] = [];
    const firstIncompleteTask = setupTasks.find((task) => !task.completed);
    if (firstIncompleteTask) {
      nextActions.push({
        id: `setup_${firstIncompleteTask.id}`,
        label: firstIncompleteTask.label,
        description: "Finish the next setup step for this workspace.",
        href: firstIncompleteTask.id === "members" ? "/dashboard/settings/integrations" : "/onboarding",
        priority: "high",
      });
    }
    if (recentImports.length === 0) {
      nextActions.push({
        id: "first_import",
        label: "Import source data",
        description: "Upload the first operating dataset for cleanup and review.",
        href: `/org/${orgId}/data`,
        priority: "high",
      });
    }
    if (dataHealthIssues.some((issue) => issue.severity === "critical")) {
      nextActions.push({
        id: "resolve_import_errors",
        label: "Resolve import errors",
        description: "Review failed rows before committing more data.",
        href: `/org/${orgId}/data`,
        priority: "high",
      });
    }
    if (pendingProposalCount > 0) {
      nextActions.push({
        id: "review_builder_proposals",
        label: "Review Builder proposals",
        description: `${pendingProposalCount} proposal${pendingProposalCount === 1 ? "" : "s"} waiting for approval.`,
        href: "/builder-studio",
        priority: "medium",
      });
    }
    if (workflowConfigCount + customFieldCount + automationRuleCount + aiContextCount + viewConfigCount === 0) {
      nextActions.push({
        id: "configure_workspace",
        label: "Configure the workspace",
        description: "Add workflow steps, fields, automations, and vocabulary.",
        href: "/builder-studio",
        priority: "medium",
      });
    }

    return jsonOk({
      org: {
        id: org.id,
        name: org.name,
        logo_url: org.branding?.logo_url ?? null,
        description: org.org_type_config?.description ?? null,
        ein: org.ein,
        org_type: org.org_type,
        website: org.website,
        created_at: org.created_at,
      },
      stats,
      recent_activity: activity.slice(0, 10),
      setup_progress: isNewOrg
        ? {
            tasks: setupTasks,
            completed_count: completedTasks,
            total_count: setupTasks.length,
          }
        : null,
      workbench: {
        next_actions: nextActions.slice(0, 4),
        data_health: {
          score: Math.max(
            0,
            100 -
              dataHealthIssues.reduce((sum, issue) => {
                if (issue.severity === "critical") return sum + Math.min(40, issue.count * 5);
                if (issue.severity === "warning") return sum + Math.min(25, issue.count * 3);
                return sum;
              }, 0)
          ),
          issues: dataHealthIssues,
          records_checked: holdingsHealthRows.length + donorHealthRows.length,
        },
        imports: {
          recent: recentImports,
          total_recent: recentImports.length,
        },
        builder: {
          pending_proposals: pendingProposalCount,
          configured_layers: {
            workflow_items: workflowConfigCount,
            custom_fields: customFieldCount,
            automation_rules: automationRuleCount,
            ai_context_items: aiContextCount,
            view_preferences: viewConfigCount,
          },
        },
        usage: {
          plan: "starter",
          imports_used: recentImports.length,
          imports_limit: 5,
          ai_calls_used: null,
          ai_calls_limit: null,
        },
      },
      user_role: access.context.role,
    });
  } catch (err) {
    console.error("Dashboard API error:", err);
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return jsonError(message, 500);
  }
}
