/**
 * Module Client Info
 *
 * Client-safe module metadata for use in React components.
 * Does NOT include server-only data like tools, tables, or system prompts.
 *
 * Import this file in client components instead of the full registry.
 */

import type { ModuleId, ModuleInfo } from './types';

/**
 * Client-safe module information
 * Single source of truth for UI display - derived from MODULE_REGISTRY
 */
export const MODULE_INFO: Record<ModuleId, ModuleInfo> = {
  core: {
    id: 'core',
    name: 'Core',
    description: 'Basic portfolio and holding management - always enabled',
    icon: 'folder',
    routes: ['/dashboard', '/dashboard/holdings', '/org'],
    isCore: true,
  },
  impact_tracking: {
    id: 'impact_tracking',
    name: 'Impact Tracking',
    description: 'KPIs, metrics, trends, and visualizations',
    icon: 'chart-bar',
    routes: ['/dashboard/metrics', '/dashboard/map', '/dashboard/widgets'],
    isCore: false,
  },
  reporting: {
    id: 'reporting',
    name: 'Reporting',
    description: 'Custom reports, templates, and document exports',
    icon: 'document-text',
    routes: ['/dashboard/reports'],
    dependencies: ['impact_tracking'],
    isCore: false,
  },
  tax_optimization: {
    id: 'tax_optimization',
    name: 'Tax Optimization',
    description: 'Tax scenarios, deductions, and compliance tracking',
    icon: 'calculator',
    routes: ['/dashboard/tax', '/dashboard/tax/scenarios', '/dashboard/tax/contributions'],
    isCore: false,
  },
  grant_management: {
    id: 'grant_management',
    name: 'Grant Management',
    description: 'Due diligence, milestones, payments, and workflow automation',
    icon: 'clipboard-check',
    routes: ['/dashboard/grants', '/dashboard/grants/workflows', '/dashboard/grants/calendar', '/dashboard/grants/payments'],
    isCore: false,
  },
  donor_management: {
    id: 'donor_management',
    name: 'Donor Management',
    description: 'Track contributions received and generate acknowledgments',
    icon: 'users',
    routes: ['/dashboard/donors', '/dashboard/donors/receipts', '/dashboard/donors/acknowledgments'],
    isCore: false,
  },
  pledge_tracking: {
    id: 'pledge_tracking',
    name: 'Pledge Tracking',
    description: 'Track donor commitments, installment schedules, and pledge fulfillment',
    icon: 'calendar-check',
    routes: ['/dashboard/pledges'],
    dependencies: ['donor_management'],
    isCore: false,
  },
  external_data: {
    id: 'external_data',
    name: 'External Data',
    description: 'Charity Navigator, Candid, and news integrations',
    icon: 'globe',
    routes: [],
    isCore: false,
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics',
    description: 'Projections, benchmarking, risk analysis, and AI-generated insights',
    icon: 'trending-up',
    routes: ['/dashboard/analytics', '/dashboard/analytics/projections', '/dashboard/analytics/benchmarks', '/dashboard/analytics/risk', '/dashboard/analytics/insights'],
    dependencies: ['impact_tracking'],
    isCore: false,
  },
  compliance_regulatory: {
    id: 'compliance_regulatory',
    name: 'Compliance & Regulatory',
    description: 'IRC §4942 payout tracking, self-dealing screening, filing calendar, and 990-PF data assembly',
    icon: 'shield-check',
    routes: ['/dashboard/compliance'],
    dependencies: ['grant_management'],
    isCore: false,
  },
};

/**
 * Get module info by ID
 */
export function getModuleInfo(moduleId: ModuleId): ModuleInfo | undefined {
  return MODULE_INFO[moduleId];
}

/**
 * Get all modules as an array (for UI listing)
 */
export function getAllModuleInfo(): ModuleInfo[] {
  return Object.values(MODULE_INFO).sort((a, b) => {
    // Core first, then alphabetically
    if (a.isCore && !b.isCore) return -1;
    if (!a.isCore && b.isCore) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Check if a route requires a specific module
 */
export function getRouteModule(route: string): ModuleId | null {
  for (const [moduleId, info] of Object.entries(MODULE_INFO)) {
    if (info.routes.some(r => route.startsWith(r))) {
      return moduleId as ModuleId;
    }
  }
  return null;
}

/**
 * Get dependencies for a module (including transitive)
 */
export function getModuleDependencies(moduleId: ModuleId): ModuleId[] {
  const deps = new Set<ModuleId>();

  function addDeps(id: ModuleId) {
    const info = MODULE_INFO[id];
    if (!info?.dependencies) return;

    for (const depId of info.dependencies) {
      if (!deps.has(depId)) {
        deps.add(depId);
        addDeps(depId);
      }
    }
  }

  addDeps(moduleId);
  return Array.from(deps);
}

/**
 * Check if a module can be disabled (not required by others)
 */
export function canDisableModuleClient(
  moduleId: ModuleId,
  enabledModules: ModuleId[]
): { canDisable: boolean; blockedBy?: string[] } {
  const info = MODULE_INFO[moduleId];

  if (!info) {
    return { canDisable: false, blockedBy: ['Module not found'] };
  }

  if (info.isCore) {
    return { canDisable: false, blockedBy: ['Core modules cannot be disabled'] };
  }

  // Check if other enabled modules depend on this one
  const blockedBy: string[] = [];
  for (const enabledId of enabledModules) {
    if (enabledId === moduleId) continue;
    const enabledInfo = MODULE_INFO[enabledId];
    if (enabledInfo?.dependencies?.includes(moduleId)) {
      blockedBy.push(enabledInfo.name);
    }
  }

  return {
    canDisable: blockedBy.length === 0,
    blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
  };
}
