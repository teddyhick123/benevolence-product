import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// POST /api/org/[orgId]/holdings/request - Request to link to a holding
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check admin access
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { holding_id } = body;

    if (!holding_id) {
      return NextResponse.json({ error: "holding_id is required" }, { status: 400 });
    }

    // Verify the holding exists
    const adminClient = createAdminClient();
    const { data: holding, error: holdingError } = await adminClient
      .from("holdings")
      .select("id, name, portfolio_id")
      .eq("id", holding_id)
      .single();

    if (holdingError || !holding) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    // Check if link already exists
    const { data: existingLink } = await supabase
      .from("organization_holdings")
      .select("organization_id, verified_at")
      .eq("organization_id", orgId)
      .eq("holding_id", holding_id)
      .single();

    if (existingLink) {
      if (existingLink.verified_at) {
        return NextResponse.json(
          { error: "This holding is already linked and verified" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: "A link request for this holding is already pending" },
        { status: 400 }
      );
    }

    // Create the link request (unverified)
    const { data: link, error: linkError } = await adminClient
      .from("organization_holdings")
      .insert({
        organization_id: orgId,
        holding_id,
        verified_at: null,
        verified_by: null,
      })
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json(link, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
