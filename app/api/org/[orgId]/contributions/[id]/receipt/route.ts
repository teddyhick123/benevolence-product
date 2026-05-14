import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

// POST /api/org/[orgId]/contributions/[id]/receipt - Generate receipt
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { send_immediately } = body;

    // Get contribution with donor info
    const { data: contribution, error: contribError } = await supabase
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
      return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
    }

    const { data: org } = await supabase
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

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Create acknowledgment letter record
    const { data: letter, error: letterError } = await supabase
      .from("acknowledgment_letters")
      .insert({
        org_id: orgId,
        donor_id: contribution.donor_id,
        contribution_ids: [id],
        subject: `Tax Receipt - ${new Date(contribution.contribution_date).toLocaleDateString()}`,
        body: receiptBody,
        status: send_immediately && donor?.email ? "sent" : "draft",
        delivery_method: "email",
        sent_at: send_immediately && donor?.email ? new Date().toISOString() : null,
        sent_by: send_immediately && donor?.email ? user?.id : null,
        recipient_email: donor?.email ?? null,
      })
      .select()
      .single();

    if (letterError) {
      return NextResponse.json({ error: letterError.message }, { status: 500 });
    }

    await supabase
      .from("contributions_received")
      .update({
        acknowledgment_sent: !!(send_immediately && donor?.email),
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("org_id", orgId);

    return NextResponse.json({
      success: true,
      letter_id: letter.id,
      sent: send_immediately && donor?.email,
      donor_email: donor?.email,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/org/[orgId]/contributions/[id]/receipt - Get receipt details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("user_org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get contribution with receipt info
    const { data: contribution, error: contribError } = await supabase
      .from("contributions_received")
      .select(`
        id, amount, contribution_date, gift_type, acknowledgment_sent, acknowledged_at,
        donors(first_name, last_name, organization_name, is_organization, email)
      `)
      .eq("id", id)
      .eq("org_id", orgId)
      .single();

    if (contribError) {
      return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
    }

    // Get related acknowledgment letter if exists
    const { data: letter } = await supabase
      .from("acknowledgment_letters")
      .select("*")
      .eq("org_id", orgId)
      .contains("contribution_ids", [id])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      contribution,
      letter,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
