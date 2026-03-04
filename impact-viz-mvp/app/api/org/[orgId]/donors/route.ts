import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/donors - List donors
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    // Check access
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Build query with filters
    let query = supabase
      .from("v_donor_summary")
      .select("*")
      .eq("organization_id", orgId);

    // Apply filters from query params
    const name = searchParams.get("name");
    const donorType = searchParams.get("donor_type");
    const donorTier = searchParams.get("donor_tier");
    const recencyStatus = searchParams.get("recency_status");
    const minGiving = searchParams.get("min_lifetime_giving");
    const pendingReceipts = searchParams.get("pending_receipts");
    const pendingAcks = searchParams.get("pending_acknowledgments");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (name) query = query.ilike("display_name", `%${name}%`);
    if (donorType) query = query.eq("donor_type", donorType);
    if (donorTier) query = query.eq("donor_tier", donorTier);
    if (recencyStatus) query = query.eq("recency_status", recencyStatus);
    if (minGiving) query = query.gte("total_lifetime_giving", parseFloat(minGiving));
    if (pendingReceipts === "true") query = query.eq("has_pending_receipts", true);
    if (pendingAcks === "true") query = query.eq("has_pending_acknowledgments", true);

    const { data: donors, error, count } = await query
      .order("total_lifetime_giving", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ donors, count: donors?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/donors - Create donor
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      donor_type,
      first_name,
      last_name,
      email,
      phone,
      organization_name,
      contact_name,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      is_anonymous,
      communication_preference,
      do_not_contact,
      notes,
      tags,
    } = body;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const { data: donor, error } = await supabase
      .from("donors")
      .insert({
        organization_id: orgId,
        donor_type: donor_type || "individual",
        first_name,
        last_name,
        email,
        phone,
        organization_name,
        contact_name,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country: country || "United States",
        is_anonymous: is_anonymous || false,
        communication_preference: communication_preference || "email",
        do_not_contact: do_not_contact || false,
        notes,
        tags: tags || [],
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(donor, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
