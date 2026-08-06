import { createServerClient } from "@/lib/api/server-client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getOrgEnabledModules } from "@/lib/modules";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import { createAdminClient } from "@/lib/supabase";
import OrgDashboardClient from "./OrgDashboardClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ orgId: string }>;
}

const MODULE_ROUTES: Record<string, string> = {
  impact_tracking: "/dashboard",
  reporting: "/dashboard/reports",
  tax_optimization: "/dashboard/tax",
  grant_management: "/dashboard/grants",
  donor_management: "/donors",
  external_data: "/charities",
  analytics: "/dashboard/analytics",
};

export default async function OrgDashboardPage({ params }: Props) {
  const { orgId } = await params;

  // Auth check
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Prove membership before using the service-role client for the dashboard.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h1 className="text-xl font-semibold text-red-800 mb-2">
            Organization Not Found
          </h1>
          <p className="text-red-600">
            This organization doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-block text-azure hover:underline"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const adminClient = createAdminClient();
  const { data: org } = await adminClient
    .from("organizations")
    .select("id, name, branding, org_type_config, ein, org_type, website, created_at")
    .eq("id", orgId)
    .single();

  if (!org) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h1 className="text-xl font-semibold text-red-800 mb-2">
            Organization Not Found
          </h1>
          <p className="text-red-600">
            This organization doesn&apos;t exist or you don&apos;t have access.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-azure hover:underline">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const userRole = membership.role;

  // Get enabled modules
  const enabledModules = await getOrgEnabledModules(adminClient, orgId);
  const nonCoreModules = enabledModules.filter((m) => m !== "core");

  // Build module data for client
  const moduleData = nonCoreModules.map((moduleId) => {
    const moduleDef = MODULE_REGISTRY[moduleId];
    const route = MODULE_ROUTES[moduleId] || "/dashboard";
    return {
      id: moduleId,
      name: moduleDef?.name || moduleId,
      description: moduleDef?.description || "",
      href: `${route}?org_id=${orgId}`,
    };
  });

  return (
    <OrgDashboardClient
      orgId={orgId}
      initialOrg={{
        ...org,
        logo_url: org.branding?.logo_url ?? null,
        description: org.org_type_config?.description ?? null,
      }}
      enabledModules={enabledModules}
      moduleData={moduleData}
      userRole={userRole}
    />
  );
}
