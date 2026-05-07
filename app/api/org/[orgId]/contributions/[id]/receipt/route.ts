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

    // Get contribution with donor and org info
    const { data: contribution, error: contribError } = await supabase
      .from("contributions_received")
      .select(`
        *,
        donors(
          id, donor_type, first_name, last_name, email, organization_name,
          address_line1, address_line2, city, state, postal_code, country
        ),
        organizations:organization_id(name, ein, website)
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (contribError) {
      return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
    }

    // Generate receipt number
    let receiptNumber = contribution.receipt_number;
    if (!receiptNumber) {
      const { data: newReceiptNum } = await supabase.rpc("generate_receipt_number", {
        p_org_id: orgId,
      });
      receiptNumber = newReceiptNum;
    }

    const org = contribution.organizations;
    const donor = contribution.donors;

    // Build donor display name
    const donorName = donor
      ? donor.donor_type === "individual"
        ? `${donor.first_name || ""} ${donor.last_name || ""}`.trim() || "Donor"
        : donor.organization_name || "Donor"
      : "Donor";

    // Build goods/services statement
    const goodsServicesStatement =
      contribution.quid_pro_quo_value > 0
        ? `The estimated value of goods and services provided in exchange for this contribution was $${contribution.quid_pro_quo_value.toLocaleString()}. The tax-deductible portion is $${contribution.tax_deductible_amount.toLocaleString()}.`
        : "No goods or services were provided in exchange for this contribution.";

    // Generate receipt content
    const receiptBody = `Dear ${donorName},

Thank you for your generous contribution to ${org?.name || "our organization"}.

This letter serves as your official receipt for tax purposes.

Contribution Details:
- Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
- Amount: $${contribution.amount.toLocaleString()}
- Type: ${contribution.contribution_type.replace("_", " ")}
- Receipt Number: ${receiptNumber}
${contribution.designation ? `- Designation: ${contribution.designation}` : ""}

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
        organization_id: orgId,
        donor_id: contribution.donor_id,
        contribution_id: id,
        letter_type: "tax_receipt",
        subject: `Tax Receipt - ${receiptNumber}`,
        body: receiptBody,
        org_name: org?.name,
        org_ein: org?.ein,
        contribution_amount: contribution.amount,
        contribution_date: contribution.contribution_date,
        goods_services_statement: goodsServicesStatement,
        status: send_immediately && donor?.email ? "sent" : "draft",
        sent_via: "email",
        sent_at: send_immediately && donor?.email ? new Date().toISOString() : null,
        created_by: user?.id,
      })
      .select()
      .single();

    if (letterError) {
      return NextResponse.json({ error: letterError.message }, { status: 500 });
    }

    // Update contribution receipt status
    await supabase
      .from("contributions_received")
      .update({
        receipt_number: receiptNumber,
        receipt_status: send_immediately && donor?.email ? "sent" : "generated",
        receipt_generated_at: new Date().toISOString(),
        receipt_sent_at: send_immediately && donor?.email ? new Date().toISOString() : null,
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      receipt_number: receiptNumber,
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
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get contribution with receipt info
    const { data: contribution, error: contribError } = await supabase
      .from("contributions_received")
      .select(`
        id, receipt_number, receipt_status, receipt_generated_at, receipt_sent_at,
        amount, contribution_date, contribution_type, tax_deductible_amount, quid_pro_quo_value,
        donors(first_name, last_name, organization_name, donor_type, email),
        organizations:organization_id(name, ein)
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (contribError) {
      return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
    }

    // Get related acknowledgment letter if exists
    const { data: letter } = await supabase
      .from("acknowledgment_letters")
      .select("*")
      .eq("contribution_id", id)
      .eq("letter_type", "tax_receipt")
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
