import { createSupabaseServerClient } from "@/lib/supabase";
import Link from "next/link";
import OrgMembersTable from "@/components/org/OrgMembersTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadMembersData(orgId: string) {
  const supabase = await createSupabaseServerClient();

  // Verify user has access
  const { data: roleData } = await supabase.rpc("user_org_role", { p_org_id: orgId });
  if (!roleData) {
    return { error: "Not authorized", org: null, members: [], isAdmin: false };
  }

  // Check if user is admin
  const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });

  // Load organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  // Load members with profiles
  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select(`
      user_id,
      organization_id,
      role,
      added_at,
      profiles:user_id (display_name)
    `)
    .eq("organization_id", orgId)
    .order("role", { ascending: true });

  if (membersError) {
    return { error: membersError.message, org, members: [], isAdmin: !!isAdmin };
  }

  return {
    error: null,
    org,
    members: members || [],
    isAdmin: !!isAdmin,
    currentRole: roleData,
  };
}

export default async function OrgMembersPage({ params }: Props) {
  const { orgId } = await params;
  const { error, org, members, isAdmin, currentRole } = await loadMembersData(orgId);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team Members</h1>
      </div>

      {!isAdmin && (
        <div className="card p-4 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            Only organization admins can add or remove members.
          </p>
        </div>
      )}

      <OrgMembersTable
        orgId={orgId}
        members={members as any}
        isAdmin={isAdmin}
      />

      {/* Role descriptions */}
      <div className="card p-6">
        <h3 className="font-medium mb-3">Role Permissions</h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-4">
            <span className="font-medium w-20">Admin</span>
            <span className="text-neutral-600">
              Full access: manage members, submit data, update settings, request holding links
            </span>
          </div>
          <div className="flex gap-4">
            <span className="font-medium w-20">Editor</span>
            <span className="text-neutral-600">
              Submit metrics, upload reports, view all data
            </span>
          </div>
          <div className="flex gap-4">
            <span className="font-medium w-20">Viewer</span>
            <span className="text-neutral-600">
              View organization data and pending metrics
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
