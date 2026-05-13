/**
 * Module Types
 *
 * Shared type definitions for the module system.
 * This file can be imported by both server and client code.
 */

/**
 * Module identifiers - the unique key for each module
 */
export type ModuleId =
  | 'core'
  | 'impact_tracking'
  | 'reporting'
  | 'tax_optimization'
  | 'grant_management'
  | 'donor_management'
  | 'pledge_tracking'
  | 'external_data'
  | 'analytics'
  | 'compliance_regulatory';

/**
 * All available module IDs as a const array (useful for iteration)
 */
export const ALL_MODULE_IDS: readonly ModuleId[] = [
  'core',
  'impact_tracking',
  'reporting',
  'tax_optimization',
  'grant_management',
  'donor_management',
  'pledge_tracking',
  'external_data',
  'analytics',
  'compliance_regulatory',
] as const;

/**
 * Client-safe module information
 * This subset of data is safe to include in client bundles
 */
export interface ModuleInfo {
  id: ModuleId;
  name: string;
  description: string;
  icon: string;
  routes: string[];
  dependencies?: ModuleId[];
  isCore: boolean;
}

/**
 * Full module definition (server-side only)
 * Extends ModuleInfo with server-specific data
 */
export interface ModuleDefinition extends ModuleInfo {
  tools: string[];
  tables: string[];
  systemPromptAddition?: string;
}

/**
 * Module preset for quick configuration
 */
export interface ModulePreset {
  id: string;
  name: string;
  description: string;
  moduleIds: ModuleId[];
  orgType?: string;
}
