import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const GIFT_TYPES = new Set([
  "cash",
  "check",
  "credit_card",
  "securities",
  "daf_grant",
  "in_kind",
  "pledge",
  "bequest",
]);

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

function normalizeContribution(row: any) {
  return {
    ...row,
    organization_id: row.org_id,
    designation: row.fund_designation,
    restriction_description: row.restriction_purpose,
    receipt_status: row.receipt_status ?? (row.acknowledgment_sent ? "sent" : "pending"),
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
      return json({ error: "Not authorized" }, { status: 403 });
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
    const contributionType = searchParams.get("gift_type");
    const receiptStatus = searchParams.get("receipt_status");
    const ackStatus = searchParams.get("acknowledgment_status");
    const campaign = searchParams.get("campaign");
    const minAmount = searchParams.get("min_amount");
    const maxAmount = searchParams.get("max_amount");
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "50", 10);
    const requestedOffset = Number.parseInt(searchParams.get("offset") || "0", 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    if (donorId) query = query.eq("donor_id", donorId);
    if (startDate) query = query.gte("contribution_date", startDate);
    if (endDate) query = query.lte("contribution_date", endDate);
    if (contributionType) query = query.eq("gift_type", contributionType);
    if (receiptStatus === "pending" || ackStatus === "pending") query = query.eq("acknowledgment_sent", false);
    if (receiptStatus === "sent" || ackStatus === "sent") query = query.eq("acknowledgment_sent", true);
    void campaign;
    if (minAmount) {
      const parsedMinAmount = Number.parseFloat(minAmount);
      if (Number.isFinite(parsedMinAmount)) query = query.gte("amount", parsedMinAmount);
    }
    if (maxAmount) {
      const parsedMaxAmount = Number.parseFloat(maxAmount);
      if (Number.isFinite(parsedMaxAmount)) query = query.lte("amount", parsedMaxAmount);
    }

    const { data: contributions, error } = await query
      .order("contribution_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({
      contributions: (contributions || []).map(normalizeContribution),
      count: contributions?.length || 0,
    });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
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
      return json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      donor_id,
      amount,
      contribution_date,
      gift_type,
      designation,
      is_restricted,
      restriction_description,
      notes,
    } = body;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    if (!donor_id) {
      return json({ error: "donor_id is required" }, { status: 400 });
    }

    if (gift_type && !GIFT_TYPES.has(gift_type)) {
      return json({ error: "Invalid gift_type" }, { status: 400 });
    }

    const { data: donor } = await supabase
      .from("donors")
      .select("id")
      .eq("id", donor_id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!donor) {
      return json({ error: "Donor does not belong to this organization" }, { status: 400 });
    }

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .insert({
        org_id: orgId,
        donor_id,
        amount: numericAmount,
        contribution_date: contribution_date || new Date().toISOString().split("T")[0],
        gift_type: gift_type || "cash",
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
      return json({ error: error.message }, { status: 500 });
    }

    return json(normalizeContribution(contribution), { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
