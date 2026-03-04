import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; donorId: string }>;
}

// GET /api/org/[orgId]/donors/[donorId] - Get donor details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    // Check access
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get donor from view (includes computed stats)
    const { data: donor, error: donorError } = await supabase
      .from("v_donor_summary")
      .select("*")
      .eq("donor_id", donorId)
      .eq("organization_id", orgId)
      .single();

    if (donorError) {
      return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    }

    // Get full donor record for additional fields
    const { data: fullDonor } = await supabase
      .from("donors")
      .select("*")
      .eq("id", donorId)
      .single();

    // Include contributions if requested
    const includeContributions = searchParams.get("contributions") !== "false";
    let contributions = [];
    if (includeContributions) {
      const year = searchParams.get("year");
      let contribQuery = supabase
        .from("contributions_received")
        .select("*")
        .eq("donor_id", donorId)
        .order("contribution_date", { ascending: false });

      if (year) {
        contribQuery = contribQuery
          .gte("contribution_date", `${year}-01-01`)
          .lte("contribution_date", `${year}-12-31`);
      }

      const { data } = await contribQuery.limit(100);
      contributions = data || [];
    }

    // Include communications if requested
    const includeCommunications = searchParams.get("communications") !== "false";
    let communications = [];
    if (includeCommunications) {
      const { data } = await supabase
        .from("donor_communications")
        .select("*")
        .eq("donor_id", donorId)
        .order("occurred_at", { ascending: false })
        .limit(50);
      communications = data || [];
    }

    return NextResponse.json({
      donor: { ...donor, ...fullDonor },
      contributions,
      communications,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/donors/[donorId] - Update donor
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();

    // Remove computed fields that shouldn't be updated directly
    const {
      total_lifetime_giving,
      total_ytd_giving,
      first_gift_date,
      last_gift_date,
      gift_count,
      largest_gift,
      average_gift,
      ...updateData
    } = body;

    const { data: donor, error } = await supabase
      .from("donors")
      .update(updateData)
      .eq("id", donorId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(donor);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/donors/[donorId] - Delete donor
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, donorId } = await params;
    const supabase = await createServerClient();

    // Check admin access (deletion requires admin)
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized - admin required" }, { status: 403 });
    }

    const { error } = await supabase
      .from("donors")
      .delete()
      .eq("id", donorId)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
