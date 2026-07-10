import { createSupabaseServerClient } from "@/lib/supabase";
import Link from "next/link";
import OrgDataEntry from "@/components/org/OrgDataEntry";
import OrgImportWorkbench from "@/components/org/OrgImportWorkbench";
import OrgReportUploader from "@/components/org/OrgReportUploader";
import type { ImportJob } from "@/lib/import/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadDataPageData(orgId: string) {
  const supabase = await createSupabaseServerClient();

  // Verify user has access and can edit
  const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
  const { data: roleData } = await supabase.rpc("user_org_role", { p_org_id: orgId });

  if (!roleData) {
    return { error: "Not authorized", canEdit: false, canManageImports: false, holdings: [], portfolios: [], importJobs: [], pendingFacts: [], uploads: [], metrics: [] };
  }
  const canManageImports = roleData === "owner" || roleData === "admin";

  // Load organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .single();

  // Load org-owned holdings for data entry
  const { data: holdingsData } = await supabase
    .from("holdings")
    .select(`
      id,
      name,
      portfolio_id
    `)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name");

  const { data: portfoliosData } = await supabase
    .from("portfolios")
    .select("id, name, org_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name");

  const { data: importJobs } = canManageImports
    ? await supabase
        .from("import_jobs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  // Load pending staging facts
  const { data: pendingFacts } = await supabase
    .from("staging_metric_facts")
    .select(`
      id,
      metric_code,
      value,
      unit,
      period_start,
      period_end,
      source,
      created_at,
      approved,
      holding_id,
      holdings (name),
      metrics (name, unit)
    `)
    .eq("submitted_by_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Load recent uploads
  const { data: uploads } = await supabase
    .from("uploads")
    .select("id, file_name, status, created_at, holding_id, holdings(name)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Load available metrics
  const { data: metrics } = await supabase
    .from("metrics")
    .select("code, name, unit")
    .order("name");

  return {
    error: null,
    org,
    canEdit: !!canEdit,
    canManageImports,
    role: roleData,
    holdings: holdingsData || [],
    portfolios: portfoliosData || [],
    importJobs: importJobs || [],
    pendingFacts: pendingFacts || [],
    uploads: uploads || [],
    metrics: metrics || [],
  };
}

export default async function OrgDataPage({ params }: Props) {
  const { orgId } = await params;
  const { error, org, canEdit, canManageImports, holdings, portfolios, importJobs, pendingFacts, uploads, metrics } = await loadDataPageData(orgId);

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

  const ownedHoldings = holdings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-neutral-500">{org?.name || "Organization"}</div>
          <h1 className="text-2xl font-semibold">Data Workbench</h1>
        </div>
      </div>

      {!canEdit && (
        <div className="card p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            You have viewer access. Contact an admin or member to submit data.
          </p>
        </div>
      )}

      <OrgImportWorkbench
        orgId={orgId}
        canManageImports={!!canManageImports}
        initialJobs={(importJobs as ImportJob[]) || []}
        portfolios={(portfolios as { id: string; name: string; org_id: string }[]) || []}
      />

      {ownedHoldings.length === 0 && (
        <div className="card p-6 text-center">
          <h3 className="font-medium mb-2">No Holdings</h3>
          <p className="text-sm text-neutral-600 mb-4">
            Add holdings to a portfolio before submitting impact data.
          </p>
          <Link
            href="/dashboard/holdings"
            className="text-azure hover:underline text-sm"
          >
            Go to Holdings
          </Link>
        </div>
      )}

      {canEdit && ownedHoldings.length > 0 && (
        <>
          {/* Manual Data Entry */}
          <div className="card p-6">
            <h2 className="text-lg font-medium mb-4">Manual Metric Entry</h2>
            <OrgDataEntry
              orgId={orgId}
              holdings={ownedHoldings as any}
              metrics={metrics}
            />
          </div>

          {/* Report Upload */}
          <div className="card p-6">
            <h2 className="text-lg font-medium mb-4">Upload Report</h2>
            <OrgReportUploader
              orgId={orgId}
              holdings={ownedHoldings as any}
            />
          </div>
        </>
      )}

      {/* Pending Facts */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">
          Pending Review ({pendingFacts.filter((f: any) => !f.approved).length})
        </h2>
        {pendingFacts.filter((f: any) => !f.approved).length === 0 ? (
          <p className="text-sm text-neutral-500">No pending metrics awaiting approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="text-left px-3 py-2 font-medium">Metric</th>
                  <th className="text-left px-3 py-2 font-medium">Holding</th>
                  <th className="text-right px-3 py-2 font-medium">Value</th>
                  <th className="text-left px-3 py-2 font-medium">Period</th>
                  <th className="text-left px-3 py-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {pendingFacts.filter((f: any) => !f.approved).map((fact: any) => (
                  <tr key={fact.id} className="border-b border-black/5">
                    <td className="px-3 py-2">
                      <div className="font-medium">{fact.metrics?.name || fact.metric_code}</div>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {fact.holdings?.name || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {fact.value?.toLocaleString()} {fact.unit || fact.metrics?.unit || ""}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {fact.period_end ? new Date(fact.period_end).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {new Date(fact.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload History */}
      <div className="card p-6">
        <h2 className="text-lg font-medium mb-4">Recent Uploads</h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-neutral-500">No uploads yet.</p>
        ) : (
          <div className="space-y-2">
            {uploads.slice(0, 10).map((upload: any) => (
              <div
                key={upload.id}
                className="flex items-center justify-between py-2 border-b border-black/5 last:border-0"
              >
                <div>
                  <div className="font-medium text-sm">{upload.file_name}</div>
                  <div className="text-xs text-neutral-500">
                    {upload.holdings?.name || "No holding"} • {new Date(upload.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    upload.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : upload.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {upload.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
