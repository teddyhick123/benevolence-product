import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/metrics - Get pending and recent metrics
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("user_org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

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
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
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
      return NextResponse.json({ error: approvedError.message }, { status: 500 });
    }

    return NextResponse.json({ pending, approved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/metrics - Submit a manual metric
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized to submit metrics" }, { status: 403 });
    }

    const body = await req.json();
    const { holding_id, metric_code, value, period_start, period_end, source } = body;

    if (!holding_id || !metric_code || value === undefined || value === null) {
      return NextResponse.json(
        { error: "holding_id, metric_code, and value are required" },
        { status: 400 }
      );
    }

    // Verify the holding is linked to this org and verified
    const { data: holdingLink } = await supabase
      .from("organization_holdings")
      .select("verified_at")
      .eq("org_id", orgId)
      .eq("holding_id", holding_id)
      .single();

    if (!holdingLink) {
      return NextResponse.json(
        { error: "Holding is not linked to this organization" },
        { status: 400 }
      );
    }

    if (!holdingLink.verified_at) {
      return NextResponse.json(
        { error: "Holding link is not yet verified by the portfolio owner" },
        { status: 400 }
      );
    }

    // Verify metric exists
    const { data: metric } = await supabase
      .from("metrics")
      .select("code, unit")
      .eq("code", metric_code)
      .single();

    if (!metric) {
      return NextResponse.json({ error: "Invalid metric code" }, { status: 400 });
    }

    // Get the holding's portfolio_id for the upload record
    const { data: holding } = await supabase
      .from("holdings")
      .select("portfolio_id")
      .eq("id", holding_id)
      .single();

    // Insert into staging_metric_facts
    const adminClient = createAdminClient();
    const { data: fact, error } = await adminClient
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(fact, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
