import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/admin/holdings/[id]/org-link - Get pending org link requests
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: holdingId } = await params;
    const supabase = await createServerClient();

    // Verify user has edit access to the portfolio
    const { data: holding } = await supabase
      .from("holdings")
      .select("portfolio_id")
      .eq("id", holdingId)
      .single();

    if (!holding) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const { data: canEdit } = await supabase.rpc("can_edit_portfolio", {
      p_portfolio_id: holding.portfolio_id,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Get all org link requests for this holding
    const { data: links, error } = await supabase
      .from("organization_holdings")
      .select(`
        organization_id,
        holding_id,
        verified_at,
        verified_by,
        created_at,
        organizations (id, name, ein, website)
      `)
      .eq("holding_id", holdingId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/holdings/[id]/org-link - Verify an org link request
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: holdingId } = await params;
    const supabase = await createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify user has edit access to the portfolio
    const { data: holding } = await supabase
      .from("holdings")
      .select("portfolio_id")
      .eq("id", holdingId)
      .single();

    if (!holding) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const { data: canEdit } = await supabase.rpc("can_edit_portfolio", {
      p_portfolio_id: holding.portfolio_id,
    });

    if (!canEdit) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { organization_id, action } = body;

    if (!organization_id) {
      return NextResponse.json(
        { error: "organization_id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    if (action === "verify") {
      // Verify the link
      const { data, error } = await adminClient
        .from("organization_holdings")
        .update({
          verified_at: new Date().toISOString(),
          verified_by: user.id,
        })
        .eq("organization_id", organization_id)
        .eq("holding_id", holdingId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    } else if (action === "reject") {
      // Delete the link request
      const { error } = await adminClient
        .from("organization_holdings")
        .delete()
        .eq("organization_id", organization_id)
        .eq("holding_id", holdingId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'verify' or 'reject'" },
        { status: 400 }
      );
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
