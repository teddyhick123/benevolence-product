import { createClient } from '@supabase/supabase-js';
import { AIAction } from './ai-assistant';

type SupabaseClient = ReturnType<typeof createClient>;

/**
 * Executes and undoes AI actions with full tracking
 */
export class AIActionExecutor {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Execute a holding creation
   */
  async createHolding(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      name: string;
      sector?: string;
      country?: string;
      funds_allocated?: number;
      status?: string;
      description?: string;
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Create the holding
    const { data: holding, error } = await this.supabase
      .from('holdings')
      .insert({
        portfolio_id: portfolioId,
        name: args.name,
        sector: args.sector,
        country: args.country,
        funds_allocated: args.funds_allocated,
        status: args.status || 'Active',
        description: args.description,
      })
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'create',
        entity_type: 'holding',
        entity_id: holding.id,
        operation_data: {
          table: 'holdings',
          after: holding,
        },
        ai_reasoning: `Created holding "${args.name}"`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: holding,
    };
  }

  /**
   * Execute a holding update
   */
  async updateHolding(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      holding_id: string;
      changes: Record<string, any>;
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Get current state for undo
    const { data: before } = await this.supabase
      .from('holdings')
      .select('*')
      .eq('id', args.holding_id)
      .single();

    // Update the holding
    const { data: after, error } = await this.supabase
      .from('holdings')
      .update(args.changes)
      .eq('id', args.holding_id)
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'update',
        entity_type: 'holding',
        entity_id: args.holding_id,
        operation_data: {
          table: 'holdings',
          before,
          after,
        },
        ai_reasoning: `Updated holding "${before?.name}"`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: after,
    };
  }

  /**
   * Execute a holding deletion
   */
  async deleteHolding(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      holding_id: string;
      reason?: string;
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Get current state for undo
    const { data: before } = await this.supabase
      .from('holdings')
      .select('*')
      .eq('id', args.holding_id)
      .single();

    // Delete the holding
    const { error } = await this.supabase
      .from('holdings')
      .delete()
      .eq('id', args.holding_id);

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'delete',
        entity_type: 'holding',
        entity_id: args.holding_id,
        operation_data: {
          table: 'holdings',
          before,
        },
        ai_reasoning: args.reason || `Deleted holding "${before?.name}"`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: { deleted: true },
    };
  }

  /**
   * Add a metric fact
   */
  async addMetricFact(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      holding_id: string;
      metric_code: string;
      value: number;
      unit?: string;
      period_start?: string;
      period_end?: string;
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Insert metric fact
    const { data: fact, error } = await this.supabase
      .from('metric_facts')
      .insert({
        holding_id: args.holding_id,
        metric_code: args.metric_code,
        value: args.value,
        unit: args.unit,
        period_start: args.period_start,
        period_end: args.period_end || new Date().toISOString().split('T')[0],
        source: 'AI Assistant',
        verification_level: 'Unverified',
      })
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'create',
        entity_type: 'metric_fact',
        entity_id: fact.id,
        operation_data: {
          table: 'metric_facts',
          after: fact,
        },
        ai_reasoning: `Added ${args.metric_code} metric: ${args.value}`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: fact,
    };
  }

  /**
   * Create a widget
   */
  async createWidget(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      holding_id: string;
      type: string;
      title: string;
      config?: any;
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Get max position for ordering
    const { data: widgets } = await this.supabase
      .from('holding_widgets')
      .select('position')
      .eq('holding_id', args.holding_id)
      .order('position', { ascending: false })
      .limit(1);

    const maxPosition = widgets?.[0]?.position ?? -1;

    // Create widget
    const { data: widget, error } = await this.supabase
      .from('holding_widgets')
      .insert({
        holding_id: args.holding_id,
        type: args.type,
        title: args.title,
        config: args.config || {},
        position: maxPosition + 1,
      })
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'create',
        entity_type: 'widget',
        entity_id: widget.id,
        operation_data: {
          table: 'holding_widgets',
          after: widget,
        },
        ai_reasoning: `Created ${args.type} widget: "${args.title}"`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: widget,
    };
  }

  /**
   * Add a location
   */
  async addLocation(
    portfolioId: string,
    userId: string,
    sessionId: string,
    batchId: string,
    sequenceOrder: number,
    userPrompt: string,
    args: {
      holding_id: string;
      name: string;
      city?: string;
      country?: string;
      lon?: number;
      lat?: number;
      tags?: string[];
    }
  ): Promise<{ action: AIAction; result: any }> {
    // Only insert if we have coordinates
    if (args.lon == null || args.lat == null) {
      throw new Error('Coordinates (lon, lat) are required for location');
    }

    // Create location
    const { data: location, error } = await this.supabase
      .from('holding_locations')
      .insert({
        portfolio_id: portfolioId,
        holding_id: args.holding_id,
        name: args.name,
        tags: args.tags || [],
        status: 'Active',
        as_of: new Date().toISOString().split('T')[0],
        lon: args.lon,
        lat: args.lat,
      })
      .select()
      .single();

    if (error) throw error;

    // Log the action
    const { data: action } = await this.supabase
      .from('ai_actions')
      .insert({
        session_id: sessionId,
        portfolio_id: portfolioId,
        user_id: userId,
        action_type: 'create',
        entity_type: 'location',
        entity_id: location.id,
        operation_data: {
          table: 'holding_locations',
          after: location,
        },
        ai_reasoning: `Added location: "${args.name}"`,
        user_prompt: userPrompt,
        status: 'applied',
        batch_id: batchId,
        sequence_order: sequenceOrder,
      })
      .select()
      .single();

    return {
      action: action as AIAction,
      result: location,
    };
  }

  /**
   * Undo an action
   */
  async undoAction(actionId: string): Promise<any> {
    // Get the action
    const { data: action, error } = await this.supabase
      .from('ai_actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (error || !action) throw new Error('Action not found');
    if (action.status === 'undone') throw new Error('Action already undone');

    const opData = action.operation_data as any;

    // Execute the undo based on action type
    switch (action.action_type) {
      case 'create':
        // Undo create = delete the entity
        await this.supabase
          .from(opData.table)
          .delete()
          .eq('id', action.entity_id);
        break;

      case 'update':
        // Undo update = restore previous values
        await this.supabase
          .from(opData.table)
          .update(opData.before)
          .eq('id', action.entity_id);
        break;

      case 'delete':
        // Undo delete = recreate the entity
        await this.supabase
          .from(opData.table)
          .insert(opData.before);
        break;
    }

    // Mark action as undone
    await this.supabase
      .from('ai_actions')
      .update({ status: 'undone', updated_at: new Date().toISOString() })
      .eq('id', actionId);

    return { success: true, action };
  }

  /**
   * Redo an action
   */
  async redoAction(actionId: string): Promise<any> {
    // Get the action
    const { data: action, error } = await this.supabase
      .from('ai_actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (error || !action) throw new Error('Action not found');
    if (action.status !== 'undone') throw new Error('Action is not undone');

    const opData = action.operation_data as any;

    // Execute the redo based on action type
    switch (action.action_type) {
      case 'create':
        // Redo create = recreate the entity
        await this.supabase
          .from(opData.table)
          .insert(opData.after);
        break;

      case 'update':
        // Redo update = apply new values
        await this.supabase
          .from(opData.table)
          .update(opData.after)
          .eq('id', action.entity_id);
        break;

      case 'delete':
        // Redo delete = delete again
        await this.supabase
          .from(opData.table)
          .delete()
          .eq('id', action.entity_id);
        break;
    }

    // Mark action as redone
    await this.supabase
      .from('ai_actions')
      .update({ status: 'redone', updated_at: new Date().toISOString() })
      .eq('id', actionId);

    return { success: true, action };
  }

  /**
   * Undo a batch of actions
   */
  async undoBatch(batchId: string): Promise<any> {
    const { data: actions } = await this.supabase
      .from('ai_actions')
      .select('*')
      .eq('batch_id', batchId)
      .eq('status', 'applied')
      .order('sequence_order', { ascending: false }); // Undo in reverse order

    const results = [];
    for (const action of actions || []) {
      const result = await this.undoAction(action.id);
      results.push(result);
    }

    return { success: true, undone: results.length };
  }
}
