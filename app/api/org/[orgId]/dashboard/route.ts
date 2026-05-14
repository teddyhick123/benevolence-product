import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";
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

// GET /api/org/[orgId]/dashboard - Get dashboard data
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Check access
    const { data: role } = await supabase.rpc("user_org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get organization details
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .select("id, name, branding, org_type_config, ein, org_type, website, created_at")
      .eq("id", orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
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

    // Get linked holdings count (core)
    const { count: holdingsCount } = await adminClient
      .from("organization_holdings")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .not("verified_at", "is", null);

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

    // Grant management stats
    // Note: grant_details is portfolio-scoped (linked via holding_id), so we query
    // through organization_holdings to find grants for holdings linked to this org
    if (enabledModules.includes("grant_management")) {
      // Get grants for holdings linked to this organization
      const { data: orgHoldings } = await adminClient
        .from("organization_holdings")
        .select("holding_id")
        .eq("org_id", orgId)
        .not("verified_at", "is", null);

      const holdingIds = orgHoldings?.map((h) => h.holding_id) || [];

      if (holdingIds.length > 0) {
        // Count grants for these holdings (active = within grant period or no end date)
        const { count: activeGrantsCount } = await adminClient
          .from("grant_details")
          .select("*", { count: "exact", head: true })
          .in("holding_id", holdingIds)
          .or("grant_period_end.is.null,grant_period_end.gte." + new Date().toISOString().split("T")[0]);

        stats.active_grants = activeGrantsCount || 0;

        // Upcoming deadlines (next 30 days) - milestones for these grants
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const { count: deadlinesCount } = await adminClient
          .from("grant_milestones")
          .select("*, grant_details!inner(holding_id)", { count: "exact", head: true })
          .in("grant_details.holding_id", holdingIds)
          .lte("due_date", thirtyDaysFromNow.toISOString().split("T")[0])
          .gte("due_date", new Date().toISOString().split("T")[0])
          .eq("status", "pending");

        stats.upcoming_deadlines = deadlinesCount || 0;
      } else {
        stats.active_grants = 0;
        stats.upcoming_deadlines = 0;
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

    return NextResponse.json({
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
      user_role: role,
    });
  } catch (err: any) {
    console.error("Dashboard API error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
