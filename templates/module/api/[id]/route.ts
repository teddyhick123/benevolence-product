/**
 * {ModuleName} Item API Route
 *
 * Handles operations on individual {module_name} items.
 * Place at: /app/api/{module_name}/[id]/route.ts
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

// UUID validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/{module_name}/[id]
 * Get a single item by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;

    // Validate ID format
    if (!UUID_REGEX.test(id)) {
      return errorResponse('Invalid item ID format');
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // Fetch item with related data
    const { data, error } = await supabase
      .from('{module_name}_items')
      .select(`
        *,
        {module_name}_details (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Item not found', 404);
      }
      console.error('[{module_name}/[id]/GET]', error);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ item: data });
  } catch (err) {
    console.error('[{module_name}/[id]/GET] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * PATCH /api/{module_name}/[id]
 * Update an item
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;

    if (!UUID_REGEX.test(id)) {
      return errorResponse('Invalid item ID format');
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // Parse body
    const body = await request.json();
    const { name, description, status } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      updated_by: user.id,
    };

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return errorResponse('name cannot be empty');
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description?.trim() || null;
    }

    if (status !== undefined) {
      if (!['active', 'inactive', 'archived'].includes(status)) {
        return errorResponse('Invalid status value');
      }
      updates.status = status;
    }

    // Check if there's anything to update
    if (Object.keys(updates).length === 1) {
      return errorResponse('No fields to update');
    }

    // Perform update
    const { data, error } = await supabase
      .from('{module_name}_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Item not found', 404);
      }
      console.error('[{module_name}/[id]/PATCH]', error);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ item: data });
  } catch (err) {
    console.error('[{module_name}/[id]/PATCH] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}

/**
 * DELETE /api/{module_name}/[id]
 * Delete an item
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = params;

    if (!UUID_REGEX.test(id)) {
      return errorResponse('Invalid item ID format');
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // Delete item
    const { error } = await supabase
      .from('{module_name}_items')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return errorResponse('Item not found', 404);
      }
      console.error('[{module_name}/[id]/DELETE]', error);
      return errorResponse(error.message, 500);
    }

    return jsonResponse({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[{module_name}/[id]/DELETE] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
}
