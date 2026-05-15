/**
 * {ModuleName} API Route
 *
 * Handles CRUD operations for {module_name} items.
 * Place at: /app/api/{module_name}/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// Standard response helpers
function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/{module_name}
 * List items with optional filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('org_id');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!orgId) {
      return errorResponse('org_id is required');
    }

    // Build query
    let query = supabase
      .from('{module_name}_items')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100));

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[{module_name}/GET]', error);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({
      items: data || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error('[{module_name}/GET] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * POST /api/{module_name}
 * Create a new item
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse body
    const body = await request.json();
    const { org_id, name, description } = body;

    // Validate required fields
    if (!org_id) {
      return errorResponse('org_id is required');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('name is required');
    }

    // Verify org membership (RLS will also check this)
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) {
      return errorResponse('Not a member of this organization', 403);
    }

    // Create item
    const { data, error } = await supabase
      .from('{module_name}_items')
      .insert({
        org_id,
        name: name.trim(),
        description: description?.trim() || null,
        created_by: user.id,
        updated_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[{module_name}/POST]', error);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ item: data }, 201);
  } catch (err) {
    console.error('[{module_name}/POST] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}
