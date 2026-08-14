/**
 * Modules System
 *
 * Export all module-related functionality.
 *
 * For CLIENT components, import from:
 *   - '@/lib/modules/types' for types only
 *   - '@/lib/modules/client-info' for MODULE_INFO
 *
 * This file exports server-side functionality that uses Node.js/Supabase.
 */

// Shared types (can be used anywhere)
export type { ModuleId, ModuleDefinition, ModuleInfo, ModulePreset } from './types';
export { ALL_MODULE_IDS } from './types';

// Client-safe info (can be used in client components)
export {
  MODULE_INFO,
  getModuleInfo,
  getAllModuleInfo,
  getRouteModule,
  getModuleDependencies,
  canDisableModuleClient,
} from './client-info';

// Server-side registry (contains tools, tables, system prompts)
export {
  MODULE_REGISTRY,
  getToolsForModules,
  getSystemPromptForModules,
  isRouteAccessible,
  getAllModules,
  canDisableModule,
  getRequiredModules,
} from './registry';

// Server-side tool filtering and module management (uses Supabase)
export {
  filterToolsForOrg,
  getOrgEnabledModules,
  enableModule,
  disableModule,
  applyModulePreset,
  getModulePresets,
  orgHasModule,
  getModuleConfig,
  updateModuleConfig,
  toDbModuleSlug,
} from './tool-filter';
