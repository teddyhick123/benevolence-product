import { createSupabaseServerClient } from "@/lib/supabase";
import Link from "next/link";
import OrgSettingsForm from "@/components/org/OrgSettingsForm";
import HoldingLinkRequests from "@/components/org/HoldingLinkRequests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadSettingsData(orgId: string) {
  const supabase = await createSupabaseServerClient();

  // Verify user is admin
  const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
  const { data: roleData } = await supabase.rpc("user_org_role", { p_org_id: orgId });

  if (!roleData) {
    return { error: "Not authorized", org: null, holdings: [], charity: null, isAdmin: false };
  }

  // Load organization with charity link
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select(`
      *,
      charities (
        id,
        name,
        ein,
        website
      )
    `)
    .eq("id", orgId)
    .single();

  if (orgError) {
    return { error: orgError.message, org: null, holdings: [], charity: null, isAdmin: !!isAdmin };
  }

  // Load holdings owned by this organization
  const { data: holdingRows } = await supabase
    .from("holdings")
    .select(`
      id,
      name,
      portfolio_id,
      created_at,
      portfolios (name)
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name");

  const holdingLinks = (holdingRows || []).map((holding: any) => ({
    organization_id: orgId,
    org_id: orgId,
    holding_id: holding.id,
    verified_at: holding.created_at,
    verified_by: null,
    created_at: holding.created_at,
    holdings: {
      id: holding.id,
      name: holding.name,
      portfolio_id: holding.portfolio_id,
      portfolios: holding.portfolios,
    },
  }));

  return {
    error: null,
    org,
    holdings: holdingLinks || [],
    charity: org?.charities || null,
    isAdmin: !!isAdmin,
    role: roleData,
  };
}

export default async function OrgSettingsPage({ params }: Props) {
  const { orgId } = await params;
  const { error, org, holdings, charity, isAdmin, role } = await loadSettingsData(orgId);

  if (error) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
        <p className="text-neutral-600">{error}</p>
        <Link href="/org" className="mt-4 inline-block text-azure hover:underline">
          Back to organizations
        </Link>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-red-600 mb-2">Not Found</h2>
        <p className="text-neutral-600">Organization not found.</p>
      </div>
    );
  }

  const pendingLinks = holdings.filter((h: any) => !h.verified_at);
  const verifiedLinks = holdings.filter((h: any) => h.verified_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        {isAdmin && (
          <Link
            href={`/org/${orgId}/settings/workflow`}
            className="text-sm font-medium text-azure hover:underline"
          >
            Workflow settings
          </Link>
        )}
      </div>

      {!isAdmin && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            Only organization admins can update settings.
          </p>
        </div>
      )}

      {/* Organization Profile */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">Organization Profile</h2>
        <OrgSettingsForm org={org} isAdmin={isAdmin} />
      </div>

      {/* Charity Link */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">Charity Database Link</h2>
        {charity ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="font-medium">Linked to: {charity.name}</span>
            </div>
            <div className="text-sm text-neutral-600">
              EIN: {charity.ein} • {charity.website && (
                <a href={charity.website} target="_blank" rel="noopener noreferrer" className="text-azure hover:underline">
                  Website
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-600">
            <p className="mb-2">Not linked to the global charities database.</p>
            {isAdmin && (
              <p>
                Enter your EIN in the profile above to automatically link to your charity record.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Holding Links */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">Linked Holdings</h2>
        <HoldingLinkRequests
          orgId={orgId}
          pendingLinks={pendingLinks as any}
          verifiedLinks={verifiedLinks as any}
          isAdmin={isAdmin}
        />
      </div>

      {/* Danger Zone */}
      {isAdmin && (
        <div className="card p-6 border-red-200 bg-red-50/50">
          <h2 className="text-lg font-medium text-red-700 mb-4">Danger Zone</h2>
          <p className="text-sm text-red-600 mb-4">
            Deleting your organization will remove all members and unlink all holdings.
            This action cannot be undone.
          </p>
          <button
            className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition"
            disabled
          >
            Delete Organization (Coming Soon)
          </button>
        </div>
      )}
    </div>
  );
}
