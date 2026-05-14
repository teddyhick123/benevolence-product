import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function normalizeContribution(row: any) {
  return {
    ...row,
    organization_id: row.org_id,
    contribution_type: row.gift_type,
    designation: row.fund_designation,
    restriction_description: row.restriction_purpose,
    receipt_status: row.acknowledgment_sent ? "sent" : "pending",
    acknowledgment_status: row.acknowledgment_sent ? "sent" : "pending",
  };
}

// GET /api/org/[orgId]/contributions - List contributions
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    // Check access
    const { data: role } = await supabase.rpc("user_org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    let query = supabase
      .from("contributions_received")
      .select(`
        *,
        donors(first_name, last_name, organization_name, is_organization, email)
      `)
      .eq("org_id", orgId);

    // Apply filters
    const donorId = searchParams.get("donor_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");
    const contributionType = searchParams.get("contribution_type");
    const receiptStatus = searchParams.get("receipt_status");
    const ackStatus = searchParams.get("acknowledgment_status");
    const campaign = searchParams.get("campaign");
    const minAmount = searchParams.get("min_amount");
    const maxAmount = searchParams.get("max_amount");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (donorId) query = query.eq("donor_id", donorId);
    if (startDate) query = query.gte("contribution_date", startDate);
    if (endDate) query = query.lte("contribution_date", endDate);
    if (contributionType) query = query.eq("gift_type", contributionType);
    if (receiptStatus === "pending" || ackStatus === "pending") query = query.eq("acknowledgment_sent", false);
    if (receiptStatus === "sent" || ackStatus === "sent") query = query.eq("acknowledgment_sent", true);
    void campaign;
    if (minAmount) query = query.gte("amount", parseFloat(minAmount));
    if (maxAmount) query = query.lte("amount", parseFloat(maxAmount));

    const { data: contributions, error } = await query
      .order("contribution_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      contributions: (contributions || []).map(normalizeContribution),
      count: contributions?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/contributions - Create contribution
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
      donor_id,
      amount,
      contribution_date,
      contribution_type,
      designation,
      is_restricted,
      restriction_description,
      notes,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    if (!donor_id) {
      return NextResponse.json({ error: "donor_id is required" }, { status: 400 });
    }

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .insert({
        org_id: orgId,
        donor_id,
        amount,
        contribution_date: contribution_date || new Date().toISOString().split("T")[0],
        gift_type: contribution_type || "cash",
        fund_designation: designation || null,
        is_restricted: is_restricted || false,
        restriction_purpose: restriction_description || null,
        notes,
      })
      .select(`
        *,
        donors(first_name, last_name, organization_name, is_organization, email)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(normalizeContribution(contribution), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
