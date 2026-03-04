import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/acknowledgments - List acknowledgment letters
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

    let query = supabase
      .from("acknowledgment_letters")
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, donor_type, email)
      `)
      .eq("organization_id", orgId);

    // Apply filters
    const donorId = searchParams.get("donor_id");
    const letterType = searchParams.get("letter_type");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    if (donorId) query = query.eq("donor_id", donorId);
    if (letterType) query = query.eq("letter_type", letterType);
    if (status) query = query.eq("status", status);

    const { data: letters, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ letters, count: letters?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/acknowledgments - Create acknowledgment letter
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
      contribution_id,
      letter_type,
      subject,
      body: letterBody,
      custom_message,
      send_via,
    } = body;

    if (!donor_id) {
      return NextResponse.json({ error: "donor_id is required" }, { status: 400 });
    }

    // Get donor info
    const { data: donor, error: donorError } = await supabase
      .from("donors")
      .select("*")
      .eq("id", donor_id)
      .single();

    if (donorError) {
      return NextResponse.json({ error: "Donor not found" }, { status: 404 });
    }

    // Get organization info
    const { data: org } = await supabase
      .from("organizations")
      .select("name, ein")
      .eq("id", orgId)
      .single();

    const donorName =
      donor.donor_type === "individual"
        ? `${donor.first_name || ""} ${donor.last_name || ""}`.trim() || "Donor"
        : donor.organization_name || "Donor";

    const type = letter_type || "thank_you";
    let finalSubject = subject;
    let finalBody = letterBody;

    // Auto-generate content if not provided
    if (!finalBody) {
      if (type === "thank_you") {
        let contributionInfo = "";
        if (contribution_id) {
          const { data: contrib } = await supabase
            .from("contributions_received")
            .select("amount, contribution_date")
            .eq("id", contribution_id)
            .single();

          if (contrib) {
            contributionInfo = `\n\nYour recent gift of $${contrib.amount.toLocaleString()} on ${new Date(
              contrib.contribution_date
            ).toLocaleDateString()} will make a real difference in our work.`;
          }
        }

        finalSubject = finalSubject || "Thank You for Your Generous Support";
        finalBody = `Dear ${donorName},

Thank you so much for your generous support of ${org?.name || "our organization"}!${contributionInfo}

${custom_message || "Your contribution helps us continue our important work in the community."}

We are deeply grateful for donors like you who make our mission possible.

With sincere thanks,
${org?.name || "The Organization"}`;
      } else if (type === "annual_summary") {
        // Get annual summary
        const { data: summary } = await supabase.rpc("get_donor_annual_summary", {
          p_donor_id: donor_id,
        });

        const summaryData = summary?.[0] || {
          total_contributions: 0,
          contribution_count: 0,
          total_tax_deductible: 0,
        };

        finalSubject = finalSubject || `Your ${new Date().getFullYear()} Giving Summary`;
        finalBody = `Dear ${donorName},

Thank you for your incredible generosity this year!

Your ${new Date().getFullYear()} Giving Summary:
- Total Contributions: $${Number(summaryData.total_contributions).toLocaleString()}
- Number of Gifts: ${summaryData.contribution_count}
- Total Tax-Deductible: $${Number(summaryData.total_tax_deductible).toLocaleString()}

${custom_message || "Your support has made a tremendous impact on our mission."}

${org?.ein ? `Organization EIN: ${org.ein}` : ""}

With gratitude,
${org?.name || "The Organization"}`;
      } else if (type === "welcome") {
        finalSubject = finalSubject || `Welcome to ${org?.name || "Our Organization"}`;
        finalBody = `Dear ${donorName},

Welcome to the ${org?.name || "our organization"} family!

Thank you for your first gift to our organization. We are thrilled to have you as a supporter.

${custom_message || "Your generosity will help us continue our important work."}

We look forward to keeping you updated on the impact of your support.

Warmly,
${org?.name || "The Organization"}`;
      } else {
        finalSubject = finalSubject || custom_message?.substring(0, 50) || "Message from " + (org?.name || "Our Organization");
        finalBody = custom_message || "";
      }
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const { data: letter, error } = await supabase
      .from("acknowledgment_letters")
      .insert({
        organization_id: orgId,
        donor_id,
        contribution_id: contribution_id || null,
        letter_type: type,
        subject: finalSubject,
        body: finalBody,
        org_name: org?.name,
        org_ein: org?.ein,
        status: "draft",
        sent_via: send_via || "email",
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update contribution acknowledgment status if specified
    if (contribution_id) {
      await supabase
        .from("contributions_received")
        .update({ acknowledgment_status: "draft" })
        .eq("id", contribution_id);
    }

    return NextResponse.json(letter, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
