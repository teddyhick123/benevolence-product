/**
 * Tool Filter
 *
 * Filters AI tools based on organization's enabled modules.
 * Handles enabling/disabling modules with dependency management.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  ModuleId,
  MODULE_REGISTRY,
  getToolsForModules,
  getRequiredModules,
  canDisableModule,
} from './registry';

// Import Anthropic types
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Filter tools array based on enabled modules
 */
export function filterToolsForOrg(
  allTools: Anthropic.Tool[],
  enabledModules: ModuleId[]
): Anthropic.Tool[] {
  const allowedToolNames = new Set(getToolsForModules(enabledModules));
  return allTools.filter(tool => allowedToolNames.has(tool.name));
}

/**
 * Get enabled modules for an organization from the database
 */
export async function getOrgEnabledModules(
  supabase: SupabaseClient,
  orgId: string
): Promise<ModuleId[]> {
  // Core is always enabled
  const modules: ModuleId[] = ['core'];

  try {
    const { data, error } = await supabase
      .from('organization_modules')
      .select('module_id')
      .eq('organization_id', orgId);

    if (error) {
      console.error('Error fetching org modules:', error);
      return modules;
    }

    if (data) {
      data.forEach((row: { module_id: string }) => {
        const moduleId = row.module_id as ModuleId;
        if (MODULE_REGISTRY[moduleId] && !modules.includes(moduleId)) {
          modules.push(moduleId);
        }
      });
    }
  } catch (err) {
    console.error('Error in getOrgEnabledModules:', err);
  }

  return modules;
}

/**
 * Enable a module for an organization
 * Automatically enables dependencies
 */
export async function enableModule(
  supabase: SupabaseClient,
  orgId: string,
  moduleId: ModuleId,
  userId: string,
  config: Record<string, unknown> = {}
): Promise<{ success: boolean; error?: string; enabledModules?: ModuleId[] }> {
  const module = MODULE_REGISTRY[moduleId];

  if (!module) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (module.isCore) {
    return { success: false, error: 'Core module is always enabled' };
  }

  // Get all modules to enable (including dependencies)
  const modulesToEnable: ModuleId[] = [moduleId, ...getRequiredModules(moduleId)];
  const enabledModules: ModuleId[] = [];

  try {
    for (const modId of modulesToEnable) {
      const { error } = await supabase
        .from('organization_modules')
        .upsert({
          organization_id: orgId,
          module_id: modId,
          enabled_by: userId,
          config: modId === moduleId ? config : {},
        }, {
          onConflict: 'organization_id,module_id',
        });

      if (error) {
        console.error(`Error enabling module ${modId}:`, error);
        return { success: false, error: error.message };
      }

      enabledModules.push(modId);
    }

    return { success: true, enabledModules };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Disable a module for an organization
 * Checks for dependent modules first
 */
export async function disableModule(
  supabase: SupabaseClient,
  orgId: string,
  moduleId: ModuleId
): Promise<{ success: boolean; error?: string }> {
  const module = MODULE_REGISTRY[moduleId];

  if (!module) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (module.isCore) {
    return { success: false, error: 'Core module cannot be disabled' };
  }

  // Get current enabled modules
  const currentModules = await getOrgEnabledModules(supabase, orgId);

  // Check if we can disable this module
  const { canDisable, blockedBy } = canDisableModule(moduleId, currentModules);

  if (!canDisable) {
    return {
      success: false,
      error: blockedBy
        ? `Cannot disable: required by ${blockedBy.join(', ')}`
        : 'Cannot disable this module',
    };
  }

  try {
    const { error } = await supabase
      .from('organization_modules')
      .delete()
      .eq('organization_id', orgId)
      .eq('module_id', moduleId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Apply a module preset to an organization
 */
export async function applyModulePreset(
  supabase: SupabaseClient,
  orgId: string,
  presetId: string,
  userId: string
): Promise<{ success: boolean; error?: string; enabledModules?: ModuleId[] }> {
  try {
    // Get the preset
    const { data: preset, error: presetError } = await supabase
      .from('module_presets')
      .select('module_ids')
      .eq('id', presetId)
      .single();

    if (presetError || !preset) {
      return { success: false, error: `Preset not found: ${presetId}` };
    }

    const moduleIds = preset.module_ids as ModuleId[];

    // Clear existing modules (except core)
    await supabase
      .from('organization_modules')
      .delete()
      .eq('organization_id', orgId);

    // Enable all preset modules
    const enabledModules: ModuleId[] = [];

    for (const moduleId of moduleIds) {
      const result = await enableModule(supabase, orgId, moduleId, userId);
      if (result.success && result.enabledModules) {
        result.enabledModules.forEach(m => {
          if (!enabledModules.includes(m)) {
            enabledModules.push(m);
          }
        });
      }
    }

    return { success: true, enabledModules };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}

/**
 * Get all available presets
 */
export async function getModulePresets(supabase: SupabaseClient): Promise<{
  presets: Array<{
    id: string;
    name: string;
    description: string;
    moduleIds: ModuleId[];
  }>;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('module_presets')
      .select('*')
      .order('sort_order');

    if (error) {
      return { presets: [], error: error.message };
    }

    return {
      presets: (data || []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        moduleIds: p.module_ids as ModuleId[],
      })),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { presets: [], error };
  }
}

/**
 * Check if organization has a specific module enabled
 */
export async function orgHasModule(
  supabase: SupabaseClient,
  orgId: string,
  moduleId: ModuleId
): Promise<boolean> {
  const module = MODULE_REGISTRY[moduleId];

  // Core is always enabled
  if (module?.isCore) {
    return true;
  }

  try {
    const { data, error } = await supabase
      .from('organization_modules')
      .select('module_id')
      .eq('organization_id', orgId)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (error) {
      console.error('Error checking module:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('Error in orgHasModule:', err);
    return false;
  }
}

/**
 * Get module configuration for an organization
 */
export async function getModuleConfig(
  supabase: SupabaseClient,
  orgId: string,
  moduleId: ModuleId
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase
      .from('organization_modules')
      .select('config')
      .eq('organization_id', orgId)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data.config as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Update module configuration
 */
export async function updateModuleConfig(
  supabase: SupabaseClient,
  orgId: string,
  moduleId: ModuleId,
  config: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('organization_modules')
      .update({ config })
      .eq('organization_id', orgId)
      .eq('module_id', moduleId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error };
  }
}
