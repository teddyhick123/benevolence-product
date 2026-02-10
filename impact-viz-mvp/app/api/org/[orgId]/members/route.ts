import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/members - List organization members
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    // Check access
    const { data: role } = await supabase.rpc("org_role", { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data: members, error } = await supabase
      .from("organization_members")
      .select(
        `
        user_id,
        organization_id,
        role,
        added_at,
        profiles:user_id (display_name)
      `
      )
      .eq("organization_id", orgId)
      .order("role", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/members - Add a member
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
    const { email, user_id, role } = body;

    if (!role || !["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Get user ID from email if provided
    let targetUserId = user_id;
    if (email && !user_id) {
      const adminClient = createAdminClient();
      const { data: users, error: lookupError } = await adminClient.auth.admin.listUsers();

      if (lookupError) {
        return NextResponse.json({ error: "Failed to lookup user" }, { status: 500 });
      }

      const foundUser = users.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!foundUser) {
        return NextResponse.json(
          { error: "No user found with that email address" },
          { status: 404 }
        );
      }

      targetUserId = foundUser.id;
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Either email or user_id is required" },
        { status: 400 }
      );
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", targetUserId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 400 }
      );
    }

    // Add member using admin client to bypass RLS for insert
    const adminClient = createAdminClient();
    const { data: member, error } = await adminClient
      .from("organization_members")
      .insert({
        user_id: targetUserId,
        organization_id: orgId,
        role,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(member, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/org/[orgId]/members - Update member role
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
    const { user_id, role } = body;

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!role || !["admin", "editor", "viewer"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const { data: member, error } = await supabase
      .from("organization_members")
      .update({ role })
      .eq("organization_id", orgId)
      .eq("user_id", user_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(member);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
