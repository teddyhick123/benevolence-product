import { NextRequest, NextResponse } from "next/server";
import { isAccessDenied, requireOrgAccess } from "@/lib/api/access";
import { hasOrgRole } from "@/lib/organizations/roles";

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
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;
    const { searchParams } = new URL(req.url);

    // Donor contact details are PII: /donors requires `member` for exactly this
    // reason, so viewers must not reach them through the contributions list
    // either. Viewers still get the gift record and the donor's display name;
    // receipt generation needs the address and is a member-level action.
    const donorFields = hasOrgRole(access.context.role, "member")
      ? "id, first_name, last_name, organization_name, is_organization, is_anonymous, email, address_line1, city, state, zip"
      : "id, first_name, last_name, organization_name, is_organization, is_anonymous";

    let query = supabase
      .from("contributions_received")
      .select(`
        *,
        donors(${donorFields})
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
    const access = await requireOrgAccess(orgId, "member");
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const body = await req.json();
    const {
      donor_id,
      is_anonymous,
      amount,
      contribution_date,
      gift_type,
      designation,
      is_restricted,
      restriction_description,
      quid_pro_quo_value,
      campaign,
      payment_reference,
      notes,
    } = body;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    if (gift_type && !GIFT_TYPES.has(gift_type)) {
      return json({ error: "Invalid gift_type" }, { status: 400 });
    }

    // contributions_received.donor_id is NOT NULL, so an anonymous gift still
    // needs a donor row. Each one gets its own is_anonymous donor: sharing a
    // single "Anonymous" record per org would pile unrelated givers into one
    // lifetime-giving total.
    let contributionDonorId: string = donor_id;
    let createdAnonymousDonorId: string | null = null;

    if (!contributionDonorId) {
      if (!is_anonymous) {
        return json({ error: "donor_id is required" }, { status: 400 });
      }

      const { data: anonymousDonor, error: anonymousDonorError } = await supabase
        .from("donors")
        .insert({ org_id: orgId, is_anonymous: true })
        .select("id")
        .single();

      if (anonymousDonorError || !anonymousDonor) {
        return json(
          { error: anonymousDonorError?.message || "Could not create anonymous donor" },
          { status: 500 }
        );
      }
      contributionDonorId = anonymousDonor.id;
      createdAnonymousDonorId = anonymousDonor.id;
    } else {
      const { data: donor } = await supabase
        .from("donors")
        .select("id")
        .eq("id", contributionDonorId)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!donor) {
        return json({ error: "Donor does not belong to this organization" }, { status: 400 });
      }
    }

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .insert({
        org_id: orgId,
        donor_id: contributionDonorId,
        amount: numericAmount,
        contribution_date: contribution_date || new Date().toISOString().split("T")[0],
        gift_type: gift_type || "cash",
        fund_designation: designation || null,
        is_restricted: is_restricted || false,
        restriction_purpose: restriction_description || null,
        quid_pro_quo_value: Number(quid_pro_quo_value) || 0,
        campaign: campaign || null,
        payment_reference: payment_reference || null,
        notes,
      })
      .select(`
        *,
        donors(first_name, last_name, organization_name, is_organization, email)
      `)
      .single();

    if (error) {
      // The donor row above was created solely to carry this gift, so drop it
      // rather than leaving an empty anonymous donor in the CRM.
      if (createdAnonymousDonorId) {
        await supabase.from("donors").delete().eq("id", createdAnonymousDonorId).eq("org_id", orgId);
      }
      return json({ error: error.message }, { status: 500 });
    }

    return json(normalizeContribution(contribution), { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
