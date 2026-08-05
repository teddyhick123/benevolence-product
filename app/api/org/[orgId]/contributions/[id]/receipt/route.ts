import { NextRequest } from "next/server";
import { isAccessDenied, requireOrgAccess } from "@/lib/api/access";
import { jsonError, jsonOk } from "@/lib/api/responses";
import { createContributionReceiptRepository } from "@/lib/api/repositories/contribution-receipts";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

// POST /api/org/[orgId]/contributions/[id]/receipt - Generate receipt
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const access = await requireOrgAccess(orgId, "member");
    if (isAccessDenied(access)) return access.response;

    const body = await req.json().catch(() => ({}));
    const { send_immediately } = body;

    // Get contribution with donor info
    const { data: contribution, error: contribError } = await access.context.db
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

    if (contribError) {
      return jsonError("Contribution not found", 404);
    }

    const { data: org } = await access.context.db
      .from("organizations")
      .select("name, ein")
      .eq("id", orgId)
      .single();
    const donor = contribution.donors;

    // Build donor display name
    const donorName = donor
      ? donor.is_organization
        ? donor.organization_name || "Donor"
        : `${donor.first_name || ""} ${donor.last_name || ""}`.trim() || "Donor"
      : "Donor";

    // Build goods/services statement
    const goodsServicesStatement =
      "No goods or services were provided in exchange for this contribution.";

    // Generate receipt content
    const receiptBody = `Dear ${donorName},

Thank you for your generous contribution to ${org?.name || "our organization"}.

This letter serves as your official receipt for tax purposes.

Contribution Details:
- Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
- Amount: $${contribution.amount.toLocaleString()}
- Type: ${contribution.gift_type.replace("_", " ")}
${contribution.fund_designation ? `- Designation: ${contribution.fund_designation}` : ""}

${goodsServicesStatement}

${org?.ein ? `Organization EIN: ${org.ein}` : ""}

Thank you for your support!

Sincerely,
${org?.name || "The Organization"}`;

    const subject = `Tax Receipt - ${new Date(contribution.contribution_date).toLocaleDateString()}`;
    const receipt = await createContributionReceiptRepository(access.context).generate({
      contributionId: id,
      subject,
      body: receiptBody,
      sendImmediately: !!send_immediately,
      recipientEmail: donor?.email ?? null,
      amount: contribution.amount,
      contributionDate: contribution.contribution_date,
    });

    return jsonOk({
      success: true,
      letter_id: receipt?.letter?.id,
      sent: receipt?.sent ?? false,
      donor_email: donor?.email,
      receipt_number: receipt?.receipt_number ?? null,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
}

// GET /api/org/[orgId]/contributions/[id]/receipt - Get receipt details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;

    // Get contribution with receipt info
    const { data: contribution, error: contribError } = await access.context.db
      .from("contributions_received")
      .select(`
        id, amount, contribution_date, gift_type, acknowledgment_sent, acknowledged_at,
        donors(first_name, last_name, organization_name, is_organization, email)
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (contribError) {
      return jsonError("Contribution not found", 404);
    }

    // Get related acknowledgment letter if exists
    const { data: letter } = await access.context.db
      .from("acknowledgment_letters")
      .select("*")
      .eq("org_id", orgId)
      .contains("contribution_ids", [id])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonOk({
      contribution,
      letter,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
}
