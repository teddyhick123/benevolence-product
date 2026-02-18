/**
 * Modules System
 *
 * Export all module-related functionality
 */

// Types and registry
export type { ModuleId, ModuleDefinition } from './registry';
export {
  MODULE_REGISTRY,
  getToolsForModules,
  getSystemPromptForModules,
  isRouteAccessible,
  getAllModules,
  canDisableModule,
  getRequiredModules,
} from './registry';

// Tool filtering and module management
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
} from './tool-filter';
