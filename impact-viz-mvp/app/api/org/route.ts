import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/org - List user's organizations
export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("organization_members")
      .select(
        `
        role,
        organizations (*)
      `
      )
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const organizations = (data || []).map((row: any) => ({
      ...row.organizations,
      role: row.role,
    }));

    return NextResponse.json({ organizations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org - Create a new organization
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { name, ein, website, description } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Use admin client to create org and add member in one transaction
    const adminClient = createAdminClient();

    // Check if EIN already exists
    if (ein) {
      const { data: existingOrg } = await adminClient
        .from("organizations")
        .select("id")
        .eq("ein", ein)
        .single();

      if (existingOrg) {
        return NextResponse.json(
          { error: "An organization with this EIN already exists" },
          { status: 400 }
        );
      }
    }

    // Try to link to charities table by EIN
    let charityId = null;
    if (ein) {
      const { data: charity } = await adminClient
        .from("charities")
        .select("id")
        .eq("ein", ein)
        .single();

      if (charity) {
        charityId = charity.id;
      }
    }

    // Create organization
    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .insert({
        name: name.trim(),
        ein: ein?.trim() || null,
        website: website?.trim() || null,
        description: description?.trim() || null,
        charity_id: charityId,
      })
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // Add creator as admin
    const { error: memberError } = await adminClient
      .from("organization_members")
      .insert({
        user_id: user.id,
        organization_id: org.id,
        role: "admin",
      });

    if (memberError) {
      // Rollback org creation
      await adminClient.from("organizations").delete().eq("id", org.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json(org, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
