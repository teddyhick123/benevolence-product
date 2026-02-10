import { createSupabaseServerClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import OrgDashboard from "@/components/org/OrgDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadOrgData(orgId: string) {
  const supabase = await createSupabaseServerClient();

  // Verify user has access
  const { data: roleData } = await supabase.rpc("org_role", { p_org_id: orgId });
  if (!roleData) {
    return { error: "Not authorized", org: null, holdings: [], pendingFacts: [], recentFacts: [] };
  }

  // Load organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (orgError || !org) {
    return { error: orgError?.message || "Organization not found", org: null, holdings: [], pendingFacts: [], recentFacts: [] };
  }

  // Load linked holdings
  const { data: holdingsData } = await supabase
    .from("organization_holdings")
    .select(`
      holding_id,
      verified_at,
      holdings (
        id,
        name,
        portfolio_id,
        portfolios (name)
      )
    `)
    .eq("organization_id", orgId);

  // Load pending staging facts
  const { data: pendingFacts } = await supabase
    .from("staging_metric_facts")
    .select(`
      id,
      metric_code,
      value,
      period_end,
      created_at,
      holdings (name),
      metrics (name, unit)
    `)
    .eq("submitted_by_org_id", orgId)
    .eq("approved", false)
    .order("created_at", { ascending: false })
    .limit(10);

  // Load recent approved facts
  const { data: recentFacts } = await supabase
    .from("metric_facts")
    .select(`
      id,
      metric_code,
      value,
      period_end,
      updated_at,
      holdings (name),
      metrics (name, unit)
    `)
    .eq("submitted_by_org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(10);

  return {
    error: null,
    org,
    role: roleData,
    holdings: holdingsData || [],
    pendingFacts: pendingFacts || [],
    recentFacts: recentFacts || [],
  };
}

export default async function OrgDashboardPage({ params }: Props) {
  const { orgId } = await params;
  const { error, org, role, holdings, pendingFacts, recentFacts } = await loadOrgData(orgId);

  if (error || !org) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
        <p className="text-neutral-600">{error || "Organization not found"}</p>
        <Link href="/org" className="mt-4 inline-block text-azure hover:underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  return (
    <OrgDashboard
      org={org}
      role={role}
      holdings={holdings}
      pendingFacts={pendingFacts}
      recentFacts={recentFacts}
    />
  );
}
