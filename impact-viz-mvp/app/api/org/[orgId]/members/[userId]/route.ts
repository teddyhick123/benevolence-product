import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; userId: string }>;
}

// DELETE /api/org/[orgId]/members/[userId] - Remove a member
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, userId } = await params;
    const supabase = await createServerClient();

    // Check admin access
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Check if trying to remove the last admin
    const { data: admins } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("role", "admin");

    const { data: targetMember } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .single();

    if (
      targetMember?.role === "admin" &&
      admins &&
      admins.length === 1 &&
      admins[0].user_id === userId
    ) {
      return NextResponse.json(
        { error: "Cannot remove the last admin. Assign another admin first." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
