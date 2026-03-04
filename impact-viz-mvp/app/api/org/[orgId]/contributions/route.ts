import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/contributions - List contributions
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

    // Build query using the view for donor info
    let query = supabase
      .from("v_contribution_with_donor")
      .select("*")
      .eq("organization_id", orgId);

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
    if (contributionType) query = query.eq("contribution_type", contributionType);
    if (receiptStatus) query = query.eq("receipt_status", receiptStatus);
    if (ackStatus) query = query.eq("acknowledgment_status", ackStatus);
    if (campaign) query = query.eq("campaign", campaign);
    if (minAmount) query = query.gte("amount", parseFloat(minAmount));
    if (maxAmount) query = query.lte("amount", parseFloat(maxAmount));

    const { data: contributions, error } = await query
      .order("contribution_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get summary stats
    const { data: stats } = await supabase
      .from("contributions_received")
      .select("amount.sum(), id.count()")
      .eq("organization_id", orgId);

    return NextResponse.json({
      contributions,
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
      non_cash_description,
      fair_market_value,
      designation,
      is_restricted,
      restriction_description,
      quid_pro_quo_value,
      payment_reference,
      payment_method_detail,
      campaign,
      appeal_code,
      notes,
      auto_generate_receipt,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .insert({
        organization_id: orgId,
        donor_id: donor_id || null,
        amount,
        contribution_date: contribution_date || new Date().toISOString().split("T")[0],
        contribution_type: contribution_type || "cash",
        non_cash_description,
        fair_market_value,
        designation,
        is_restricted: is_restricted || false,
        restriction_description,
        quid_pro_quo_value: quid_pro_quo_value || 0,
        payment_reference,
        payment_method_detail,
        campaign,
        appeal_code,
        notes,
        created_by: user?.id,
      })
      .select(`
        *,
        donors(first_name, last_name, organization_name, donor_type, email)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-generate receipt if requested and amount >= $250
    if (auto_generate_receipt && amount >= 250) {
      const { data: receiptNumber } = await supabase.rpc("generate_receipt_number", {
        p_org_id: orgId,
      });

      if (receiptNumber) {
        await supabase
          .from("contributions_received")
          .update({
            receipt_number: receiptNumber,
            receipt_status: "generated",
            receipt_generated_at: new Date().toISOString(),
          })
          .eq("id", contribution.id);

        contribution.receipt_number = receiptNumber;
        contribution.receipt_status = "generated";
      }
    }

    return NextResponse.json(contribution, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
