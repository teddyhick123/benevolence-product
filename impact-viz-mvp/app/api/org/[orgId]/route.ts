import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId] - Get organization details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: org, error } = await supabase
      .from("organizations")
      .select(
        `
        *,
        charities (id, name, ein, website)
      `
      )
      .eq("id", orgId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...org, role });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId] - Update organization
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check admin access
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await req.json();
    const { name, ein, website, description, logo_url } = body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name?.trim() || null;
    if (ein !== undefined) updates.ein = ein?.trim() || null;
    if (website !== undefined) updates.website = website?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (logo_url !== undefined) updates.logo_url = logo_url?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    // If EIN is being updated, try to link to charities table
    if (updates.ein) {
      const adminClient = createAdminClient();
      const { data: charity } = await adminClient
        .from("charities")
        .select("id")
        .eq("ein", updates.ein)
        .single();

      if (charity) {
        updates.charity_id = charity.id;
      } else {
        updates.charity_id = null;
      }
    } else if (ein === "") {
      updates.charity_id = null;
    }

    const { data: org, error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", orgId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(org);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/org/[orgId] - Delete organization
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check admin access
    const { data: isAdmin } = await supabase.rpc("is_org_admin", { p_org_id: orgId });
    if (!isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { error } = await supabase.from("organizations").delete().eq("id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
