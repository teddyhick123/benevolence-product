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
import type { ToolDefinition } from '@/lib/ai/types';

const MODULE_TO_DB_SLUG: Record<ModuleId, string> = {
  core: 'portfolio',
  impact_tracking: 'impact_tracking',
  reporting: 'reports',
  tax_optimization: 'tax',
  grant_management: 'grant_management',
  donor_management: 'donors',
  pledge_tracking: 'pledges',
  external_data: 'external_data',
  analytics: 'analytics',
  compliance_regulatory: 'compliance',
};

const DB_SLUG_TO_MODULE: Record<string, ModuleId> = {
  portfolio: 'core',
  core: 'core',
  impact_tracking: 'impact_tracking',
  reports: 'reporting',
  reporting: 'reporting',
  tax: 'tax_optimization',
  tax_optimization: 'tax_optimization',
  grant_management: 'grant_management',
  donors: 'donor_management',
  donor_management: 'donor_management',
  pledges: 'pledge_tracking',
  pledge_tracking: 'pledge_tracking',
  external_data: 'external_data',
  analytics: 'analytics',
  compliance: 'compliance_regulatory',
  compliance_regulatory: 'compliance_regulatory',
};

function toDbSlug(moduleId: ModuleId): string {
  return MODULE_TO_DB_SLUG[moduleId] ?? moduleId;
}

function fromDbSlug(slug: string): ModuleId | null {
  return DB_SLUG_TO_MODULE[slug] ?? null;
}

async function getOrgModulesJson(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ modules: Record<string, unknown>; error?: string }> {
  const { data, error } = await supabase
    .from('organizations')
    .select('modules')
    .eq('id', orgId)
    .single();

  if (error) {
    return { modules: { portfolio: true }, error: error.message };
  }

  return {
    modules: {
      portfolio: true,
      ...((data?.modules as Record<string, unknown> | null) ?? {}),
    },
  };
}

function enabledModuleIdsFromJson(modulesJson: Record<string, unknown>): ModuleId[] {
  const modules: ModuleId[] = ['core'];

  Object.entries(modulesJson).forEach(([slug, enabled]) => {
    if (enabled !== true) return;
    const moduleId = fromDbSlug(slug);
    if (moduleId && MODULE_REGISTRY[moduleId] && !modules.includes(moduleId)) {
      modules.push(moduleId);
    }
  });

  return modules;
}

async function updateOrgModulesJson(
  supabase: SupabaseClient,
  orgId: string,
  modules: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const nextModules = { ...modules, portfolio: true };
  const { error } = await supabase
    .from('organizations')
    .update({ modules: nextModules })
    .eq('id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Filter tools array based on enabled modules
 */
export function filterToolsForOrg(
  allTools: ToolDefinition[],
  enabledModules: ModuleId[]
): ToolDefinition[] {
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
  try {
    const { modules, error } = await getOrgModulesJson(supabase, orgId);
    if (error) console.error('Error fetching org modules:', error);
    return enabledModuleIdsFromJson(modules);
  } catch (err) {
    console.error('Error in getOrgEnabledModules:', err);
    return ['core'];
  }
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
  const moduleDefinition = MODULE_REGISTRY[moduleId];

  if (!moduleDefinition) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (moduleDefinition.isCore) {
    return { success: false, error: 'Core module is always enabled' };
  }

  // Get all modules to enable (including dependencies)
  const modulesToEnable: ModuleId[] = [moduleId, ...getRequiredModules(moduleId)];
  const enabledModules: ModuleId[] = [];

  try {
    void userId;
    void config;
    const { modules, error } = await getOrgModulesJson(supabase, orgId);
    if (error) return { success: false, error };

    for (const modId of modulesToEnable) {
      modules[toDbSlug(modId)] = true;
      enabledModules.push(modId);
    }

    const result = await updateOrgModulesJson(supabase, orgId, modules);
    if (!result.success) return result;

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
  const moduleDefinition = MODULE_REGISTRY[moduleId];

  if (!moduleDefinition) {
    return { success: false, error: `Unknown module: ${moduleId}` };
  }

  if (moduleDefinition.isCore) {
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
    const { modules, error } = await getOrgModulesJson(supabase, orgId);
    if (error) return { success: false, error };
    modules[toDbSlug(moduleId)] = false;
    return updateOrgModulesJson(supabase, orgId, modules);
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

    void userId;

    // Replace enabled modules with the preset plus dependencies.
    const modulesJson: Record<string, unknown> = { portfolio: true };
    const enabledModules: ModuleId[] = [];

    for (const moduleId of moduleIds) {
      const moduleSet = [moduleId, ...getRequiredModules(moduleId)];
      moduleSet.forEach(m => {
        modulesJson[toDbSlug(m)] = true;
        if (!enabledModules.includes(m)) enabledModules.push(m);
      });
    }

    const result = await updateOrgModulesJson(supabase, orgId, modulesJson);
    if (!result.success) return result;

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
  const moduleDefinition = MODULE_REGISTRY[moduleId];

  // Core is always enabled
  if (moduleDefinition?.isCore) {
    return true;
  }

  try {
    const { data, error } = await supabase
      .rpc('org_has_module', { p_org_id: orgId, p_module: moduleId });

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
  void supabase;
  void orgId;
  void moduleId;
  return null;
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
  void supabase;
  void orgId;
  void moduleId;
  void config;
  return { success: false, error: 'Module-specific config is not supported by the current organizations.modules schema' };
}
