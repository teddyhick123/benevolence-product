import { NextRequest } from "next/server";
import { isAccessDenied, requireOrgAccess } from "@/lib/api/access";
import { jsonError, jsonOk } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/metrics - Get pending and recent metrics
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId);
  if (isAccessDenied(access)) return access.response;

  try {
    const supabase = access.context.db;

    // Get pending staging facts
    const { data: pending, error: pendingError } = await supabase
      .from("staging_metric_facts")
      .select(
        `
        *,
        holdings (name),
        metrics (name, unit)
      `
      )
      .eq("submitted_by_org_id", orgId)
      .eq("approved", false)
      .order("created_at", { ascending: false });

    if (pendingError) {
      return jsonError(pendingError.message, 500);
    }

    // Get recent approved facts
    const { data: approved, error: approvedError } = await supabase
      .from("metric_facts")
      .select(
        `
        *,
        holdings (name),
        metrics (name, unit)
      `
      )
      .eq("submitted_by_org_id", orgId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (approvedError) {
      return jsonError(approvedError.message, 500);
    }

    return jsonOk({ pending, approved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch metrics";
    return jsonError(message, 500);
  }
}

// POST /api/org/[orgId]/metrics - Submit a manual metric
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, "member");
  if (isAccessDenied(access)) return access.response;

  try {
    const supabase = access.context.db;

    const body = await req.json();
    const { holding_id, metric_code, value, period_start, period_end, source } = body;

    if (!holding_id || !metric_code || value === undefined || value === null) {
      return jsonError("holding_id, metric_code, and value are required", 400);
    }

    // Verify the holding belongs to this org.
    const { data: holding } = await supabase
      .from("holdings")
      .select("id, portfolio_id")
      .eq("org_id", orgId)
      .eq("id", holding_id)
      .is("deleted_at", null)
      .single();

    if (!holding) {
      return jsonError("Holding does not belong to this organization", 400);
    }

    // Verify metric exists
    const { data: metric } = await supabase
      .from("metrics")
      .select("code, unit")
      .eq("code", metric_code)
      .single();

    if (!metric) {
      return jsonError("Invalid metric code", 400);
    }

    // Insert into staging_metric_facts
    const { data: fact, error } = await supabase
      .from("staging_metric_facts")
      .insert({
        holding_id,
        metric_code,
        value,
        unit: metric.unit,
        period_start: period_start || null,
        period_end: period_end || null,
        source: source || "Manual entry",
        verification_level: "org_submitted",
        submitted_by_org_id: orgId,
        approved: false,
      })
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk(fact, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit metric";
    return jsonError(message, 500);
  }
}
