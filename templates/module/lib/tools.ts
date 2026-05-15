/**
 * {ModuleName} Module - AI Tools
 *
 * Tool definitions and executor examples for the {ModuleName} module.
 * Copy definitions into /lib/ai/assistant/tool-definitions.ts and add
 * executor cases to /lib/ai/assistant/executor.ts.
 */

import type { ToolDefinition } from '@/lib/ai/types';
import type { ToolExecutorContext, ToolResult, AIAction } from '@/lib/ai/types';
import { InputValidator, ValidationError } from '@/lib/ai/validators';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const {module_name}Tools: ToolDefinition[] = [
  {
    name: 'list_{module_name}_items',
    description: 'List items in the {module_name} module with optional filtering',
    input_schema: {
      type: 'object',
      properties: {
        org_id: {
          type: 'string',
          description: 'Organization UUID',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'archived', 'all'],
          description: 'Filter by status (default: all)',
        },
        limit: {
          type: 'number',
          description: 'Maximum items to return (default: 50, max: 100)',
        },
        search: {
          type: 'string',
          description: 'Search term to filter by name',
        },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'get_{module_name}_item',
    description: 'Get detailed information about a specific {module_name} item',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The UUID of the item to retrieve',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'create_{module_name}_item',
    description: 'Create a new {module_name} item',
    input_schema: {
      type: 'object',
      properties: {
        org_id: {
          type: 'string',
          description: 'Organization UUID',
        },
        name: {
          type: 'string',
          description: 'Name of the item (required)',
        },
        description: {
          type: 'string',
          description: 'Optional description',
        },
        // Add more properties as needed
      },
      required: ['org_id', 'name'],
    },
  },
  {
    name: 'update_{module_name}_item',
    description: 'Update an existing {module_name} item',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The UUID of the item to update',
        },
        name: {
          type: 'string',
          description: 'New name for the item',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'archived'],
          description: 'New status',
        },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'delete_{module_name}_item',
    description: 'Delete a {module_name} item (permanent)',
    input_schema: {
      type: 'object',
      properties: {
        item_id: {
          type: 'string',
          description: 'The UUID of the item to delete',
        },
      },
      required: ['item_id'],
    },
  },
];


// =============================================================================
// TOOL EXECUTORS
// =============================================================================

/**
 * List items with optional filtering
 */
async function executeList{ModuleName}Items(
  input: { org_id: string; status?: string; limit?: number; search?: string },
  context: ToolExecutorContext
): Promise<ToolResult> {
  const { supabase } = context;

  // Validate inputs
  InputValidator.validateRequired(input.org_id, 'org_id');
  InputValidator.validateUUID(input.org_id, 'org_id');
  InputValidator.validateEnum(input.status, 'status', ['active', 'inactive', 'archived', 'all']);
  InputValidator.validateNumber(input.limit, 'limit', { min: 1, max: 100 });
  InputValidator.validateString(input.search, 'search', { maxLength: 100 });

  const limit = input.limit || 50;
  const status = input.status || 'all';

  // Build query
  let query = supabase
    .from('{module_name}_items')
    .select('*')
    .eq('org_id', input.org_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Apply filters
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (input.search) {
    query = query.ilike('name', `%${input.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list items: ${error.message}`);
  }

  return {
    action: null, // Read-only, no action tracking
    output: {
      items: data || [],
      count: data?.length || 0,
      filters: { status, limit, search: input.search },
    },
  };
}

/**
 * Get detailed item information
 */
async function executeGet{ModuleName}Item(
  input: { item_id: string },
  context: ToolExecutorContext
): Promise<ToolResult> {
  const { supabase } = context;

  // Validate
  InputValidator.validateRequired(input.item_id, 'item_id');
  InputValidator.validateUUID(input.item_id, 'item_id');

  const { data, error } = await supabase
    .from('{module_name}_items')
    .select(`
      *,
      {module_name}_details (*)
    `)
    .eq('id', input.item_id)
    .single();

  if (error) {
    throw new Error(`Item not found: ${error.message}`);
  }

  return {
    action: null,
    output: data,
  };
}

/**
 * Create a new item
 */
async function executeCreate{ModuleName}Item(
  input: { org_id: string; name: string; description?: string },
  context: ToolExecutorContext
): Promise<ToolResult> {
  const { supabase, userId, sessionId, batchId, sequenceOrder, userPrompt } = context;

  // Validate
  InputValidator.validateRequired(input.org_id, 'org_id');
  InputValidator.validateUUID(input.org_id, 'org_id');
  InputValidator.validateRequired(input.name, 'name');
  InputValidator.validateString(input.name, 'name', { maxLength: 200 });
  InputValidator.validateString(input.description, 'description', { maxLength: 2000 });

  const insertData = {
    org_id: input.org_id,
    name: input.name,
    description: input.description || null,
    created_by: userId,
    updated_by: userId,
  };

  const { data, error } = await supabase
    .from('{module_name}_items')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create item: ${error.message}`);
  }

  // Track action for undo/redo
  const action: AIAction = {
    id: crypto.randomUUID(),
    sessionId,
    portfolioId: context.portfolioId,
    userId,
    actionType: 'create',
    entityType: '{module_name}_item' as any, // Add to AIAction entityType if needed
    entityId: data.id,
    operationData: {
      table: '{module_name}_items',
      after: data,
    },
    aiReasoning: `Created {module_name} item: ${input.name}`,
    userPrompt,
    status: 'applied',
    batchId,
    sequenceOrder,
  };

  return {
    action,
    output: {
      success: true,
      item: data,
      message: `Created item "${input.name}"`,
    },
  };
}

/**
 * Update an existing item
 */
async function executeUpdate{ModuleName}Item(
  input: { item_id: string; name?: string; description?: string; status?: string },
  context: ToolExecutorContext
): Promise<ToolResult> {
  const { supabase, userId, sessionId, batchId, sequenceOrder, userPrompt } = context;

  // Validate
  InputValidator.validateRequired(input.item_id, 'item_id');
  InputValidator.validateUUID(input.item_id, 'item_id');
  InputValidator.validateString(input.name, 'name', { maxLength: 200 });
  InputValidator.validateString(input.description, 'description', { maxLength: 2000 });
  InputValidator.validateEnum(input.status, 'status', ['active', 'inactive', 'archived']);

  // Get current state for undo
  const { data: before, error: fetchError } = await supabase
    .from('{module_name}_items')
    .select('*')
    .eq('id', input.item_id)
    .single();

  if (fetchError || !before) {
    throw new Error('Item not found');
  }

  // Build update
  const updateData: Record<string, unknown> = { updated_by: userId };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.status !== undefined) updateData.status = input.status;

  const { data, error } = await supabase
    .from('{module_name}_items')
    .update(updateData)
    .eq('id', input.item_id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update item: ${error.message}`);
  }

  const action: AIAction = {
    id: crypto.randomUUID(),
    sessionId,
    portfolioId: context.portfolioId,
    userId,
    actionType: 'update',
    entityType: '{module_name}_item' as any,
    entityId: data.id,
    operationData: {
      table: '{module_name}_items',
      before,
      after: data,
    },
    aiReasoning: `Updated {module_name} item`,
    userPrompt,
    status: 'applied',
    batchId,
    sequenceOrder,
  };

  return {
    action,
    output: {
      success: true,
      item: data,
      changes: Object.keys(updateData).filter(k => k !== 'updated_by'),
    },
  };
}

/**
 * Delete an item
 */
async function executeDelete{ModuleName}Item(
  input: { item_id: string },
  context: ToolExecutorContext
): Promise<ToolResult> {
  const { supabase, userId, sessionId, batchId, sequenceOrder, userPrompt } = context;

  // Validate
  InputValidator.validateRequired(input.item_id, 'item_id');
  InputValidator.validateUUID(input.item_id, 'item_id');

  // Get current state for undo
  const { data: before, error: fetchError } = await supabase
    .from('{module_name}_items')
    .select('*')
    .eq('id', input.item_id)
    .single();

  if (fetchError || !before) {
    throw new Error('Item not found');
  }

  const { error } = await supabase
    .from('{module_name}_items')
    .delete()
    .eq('id', input.item_id);

  if (error) {
    throw new Error(`Failed to delete item: ${error.message}`);
  }

  const action: AIAction = {
    id: crypto.randomUUID(),
    sessionId,
    portfolioId: context.portfolioId,
    userId,
    actionType: 'delete',
    entityType: '{module_name}_item' as any,
    entityId: input.item_id,
    operationData: {
      table: '{module_name}_items',
      before,
    },
    aiReasoning: `Deleted {module_name} item: ${before.name}`,
    userPrompt,
    status: 'applied',
    batchId,
    sequenceOrder,
  };

  return {
    action,
    output: {
      success: true,
      deleted_id: input.item_id,
      deleted_name: before.name,
    },
  };
}


// =============================================================================
// TOOL ROUTER
// =============================================================================

/**
 * Route tool calls to appropriate executor
 */
export async function execute{ModuleName}Tool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolExecutorContext
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'list_{module_name}_items':
        return await executeList{ModuleName}Items(input as any, context);

      case 'get_{module_name}_item':
        return await executeGet{ModuleName}Item(input as any, context);

      case 'create_{module_name}_item':
        return await executeCreate{ModuleName}Item(input as any, context);

      case 'update_{module_name}_item':
        return await executeUpdate{ModuleName}Item(input as any, context);

      case 'delete_{module_name}_item':
        return await executeDelete{ModuleName}Item(input as any, context);

      default:
        throw new Error(`Unknown {module_name} tool: ${toolName}`);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        action: null,
        output: { error: error.message, type: 'validation' },
      };
    }
    throw error;
  }
}
