import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string; holdingId: string }>;
}

// DELETE /api/org/[orgId]/holdings/[holdingId] - Remove a holding link
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, holdingId } = await params;
    const supabase = await createServerClient();

    // Check admin access
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase
      .from("organization_holdings")
      .delete()
      .eq("organization_id", orgId)
      .eq("holding_id", holdingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
