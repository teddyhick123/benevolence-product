import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

function normalizeContribution(row: any) {
  return {
    ...row,
    organization_id: row.org_id,
    designation: row.fund_designation,
    restriction_description: row.restriction_purpose,
    receipt_status: row.acknowledgment_sent ? "sent" : "pending",
    acknowledgment_status: row.acknowledgment_sent ? "sent" : "pending",
  };
}

// GET /api/org/[orgId]/contributions/[id] - Get contribution details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("user_org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

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
      return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
    }

    return NextResponse.json(normalizeContribution(contribution));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/contributions/[id] - Update contribution
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();

    // Remove computed/auto fields
    const {
      tax_deductible_amount,
      created_at,
      updated_at,
      created_by,
      organization_id,
      gift_type,
      designation,
      restriction_description,
      ...rest
    } = body;
    const updateData = {
      ...rest,
      ...(gift_type !== undefined ? { gift_type } : {}),
      ...(designation !== undefined ? { fund_designation: designation } : {}),
      ...(restriction_description !== undefined ? { restriction_purpose: restriction_description } : {}),
    };
    void tax_deductible_amount;
    void created_at;
    void updated_at;
    void created_by;
    void organization_id;

    const { data: contribution, error } = await supabase
      .from("contributions_received")
      .update(updateData)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(normalizeContribution(contribution));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/contributions/[id] - Delete contribution
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check admin access (deletion requires admin)
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized - admin required" }, { status: 403 });
    }

    const { error } = await supabase
      .from("contributions_received")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
