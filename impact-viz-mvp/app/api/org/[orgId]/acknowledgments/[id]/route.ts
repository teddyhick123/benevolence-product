import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

// GET /api/org/[orgId]/acknowledgments/[id] - Get acknowledgment details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: letter, error } = await supabase
      .from("acknowledgment_letters")
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, donor_type, email, address_line1, city, state, postal_code),
        contributions_received:contribution_id(id, amount, contribution_date, contribution_type)
      `)
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (error) {
      return NextResponse.json({ error: "Acknowledgment not found" }, { status: 404 });
    }

    return NextResponse.json(letter);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/acknowledgments/[id] - Update acknowledgment
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
    const { created_at, updated_at, created_by, ...updateData } = body;

    // Handle status transitions
    if (updateData.status === "sent") {
      updateData.sent_at = new Date().toISOString();

      // Update related contribution if exists
      const { data: letter } = await supabase
        .from("acknowledgment_letters")
        .select("contribution_id, letter_type")
        .eq("id", id)
        .single();

      if (letter?.contribution_id) {
        if (letter.letter_type === "tax_receipt") {
          await supabase
            .from("contributions_received")
            .update({
              receipt_status: "sent",
              receipt_sent_at: new Date().toISOString(),
            })
            .eq("id", letter.contribution_id);
        } else {
          await supabase
            .from("contributions_received")
            .update({
              acknowledgment_status: "sent",
              acknowledgment_sent_at: new Date().toISOString(),
            })
            .eq("id", letter.contribution_id);
        }
      }
    }

    const { data: letter, error } = await supabase
      .from("acknowledgment_letters")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(letter);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId]/acknowledgments/[id] - Delete acknowledgment
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    // Check edit access
    const { data: canEdit } = await supabase.rpc("can_edit_org", { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Only allow deleting drafts
    const { data: letter } = await supabase
      .from("acknowledgment_letters")
      .select("status")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();

    if (letter?.status !== "draft") {
      return NextResponse.json(
        { error: "Only draft letters can be deleted" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("acknowledgment_letters")
      .delete()
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
