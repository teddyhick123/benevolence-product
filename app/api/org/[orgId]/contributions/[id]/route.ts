import { NextRequest, NextResponse } from "next/server";
import { isAccessDenied, requireOrgAccess } from "@/lib/api/access";

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
const UPDATE_FIELDS = new Set([
  "donor_id",
  "amount",
  "contribution_date",
  "gift_type",
  "fund_designation",
  "is_restricted",
  "restriction_purpose",
  "notes",
  "campaign",
  "payment_reference",
]);

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
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

// GET /api/org/[orgId]/contributions/[id] - Get contribution details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .select(`
        *,
        donors(
          id, is_organization, first_name, last_name, email, organization_name,
          address_line1, address_line2, city, state, zip, country
        )
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (error) {
      return json({ error: "Contribution not found" }, { status: 404 });
    }

    return json(normalizeContribution(contribution));
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/contributions/[id] - Update contribution
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const access = await requireOrgAccess(orgId, "member");
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const body = await req.json();
    const normalizedBody = {
      ...body,
      ...(body.designation !== undefined ? { fund_designation: body.designation } : {}),
      ...(body.restriction_description !== undefined
        ? { restriction_purpose: body.restriction_description }
        : {}),
    };
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(normalizedBody)) {
      if (UPDATE_FIELDS.has(key)) updateData[key] = value;
    }

    if (Object.keys(updateData).length === 0) {
      return json({ error: "No valid fields to update" }, { status: 400 });
    }

    if (updateData.gift_type !== undefined && !GIFT_TYPES.has(updateData.gift_type)) {
      return json({ error: "Invalid gift_type" }, { status: 400 });
    }

    if (updateData.amount !== undefined) {
      const numericAmount = Number(updateData.amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return json({ error: "Amount must be greater than 0" }, { status: 400 });
      }
      updateData.amount = numericAmount;
    }

    if (updateData.donor_id !== undefined) {
      const { data: donor } = await supabase
        .from("donors")
        .select("id")
        .eq("id", updateData.donor_id)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!donor) {
        return json({ error: "Donor does not belong to this organization" }, { status: 400 });
      }
    }

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .update(updateData)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json(normalizeContribution(contribution));
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/contributions/[id] - Delete contribution
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const access = await requireOrgAccess(orgId, "admin");
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const { data: contribution, error: contributionError } = await supabase
      .from("contributions_received")
      .select("id, pledge_installment_id")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (contributionError) {
      return json({ error: contributionError.message }, { status: 500 });
    }

    if (!contribution) {
      return json({ error: "Contribution not found" }, { status: 404 });
    }

    const { data: linkedInstallment, error: linkedInstallmentError } = await supabase
      .from("pledge_installments")
      .select("id, pledge_id, status")
      .eq("org_id", orgId)
      .eq("contribution_id", id)
      .maybeSingle();

    if (linkedInstallmentError) {
      return json({ error: linkedInstallmentError.message }, { status: 500 });
    }

    if (contribution.pledge_installment_id || linkedInstallment) {
      return json(
        {
          error: "Contribution is linked to a pledge installment. Reopen or reconcile the pledge installment before deleting this contribution.",
          pledge_installment_id: contribution.pledge_installment_id ?? linkedInstallment?.id ?? null,
          pledge_id: linkedInstallment?.pledge_id ?? null,
          installment_status: linkedInstallment?.status ?? null,
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("contributions_received")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
