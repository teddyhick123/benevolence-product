'use client';

/**
 * Module Context
 *
 * Provides module state management for the frontend.
 * Allows components to check which modules are enabled and conditionally render.
 *
 * Uses shared types and info from lib/modules for single source of truth.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { createBrowserClient } from '@/lib/supabase-browser';
import type { ModuleId } from '@/lib/modules/types';
import { MODULE_INFO, getModuleDependencies, canDisableModuleClient, getRouteModule } from '@/lib/modules/client-info';

// Re-export for backwards compatibility
export type { ModuleId } from '@/lib/modules/types';
export { MODULE_INFO } from '@/lib/modules/client-info';

interface ModuleContextType {
  enabledModules: ModuleId[];
  loading: boolean;
  error: string | null;
  isModuleEnabled: (moduleId: ModuleId) => boolean;
  canAccessRoute: (route: string) => boolean;
  refreshModules: () => Promise<void>;
  enableModule: (moduleId: ModuleId) => Promise<{ success: boolean; error?: string }>;
  disableModule: (moduleId: ModuleId) => Promise<{ success: boolean; error?: string }>;
}

const ModuleContext = createContext<ModuleContextType | null>(null);

interface ModuleProviderProps {
  children: ReactNode;
  orgId: string;
}

export function ModuleProvider({ children, orgId }: ModuleProviderProps) {
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>(['core']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createBrowserClient();

  const fetchModules = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('organization_modules')
        .select('module_id')
        .eq('organization_id', orgId);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      const modules: ModuleId[] = ['core'];
      if (data) {
        data.forEach((row: { module_id: string }) => {
          const moduleId = row.module_id as ModuleId;
          if (MODULE_INFO[moduleId] && !modules.includes(moduleId)) {
            modules.push(moduleId);
          }
        });
      }

      setEnabledModules(modules);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, [orgId, supabase]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const isModuleEnabled = useCallback((moduleId: ModuleId): boolean => {
    // Core is always enabled
    if (moduleId === 'core') return true;
    return enabledModules.includes(moduleId);
  }, [enabledModules]);

  const canAccessRoute = useCallback((route: string): boolean => {
    // Check all enabled modules for this route
    for (const moduleId of enabledModules) {
      const info = MODULE_INFO[moduleId];
      if (info?.routes.some(r => route.startsWith(r))) {
        return true;
      }
    }
    return false;
  }, [enabledModules]);

  const enableModule = useCallback(async (moduleId: ModuleId): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get dependencies from shared helper (single source of truth)
      const dependencies = getModuleDependencies(moduleId);
      const modulesToEnable = [moduleId, ...dependencies];

      for (const modId of modulesToEnable) {
        const { error: insertError } = await supabase
          .from('organization_modules')
          .upsert({
            organization_id: orgId,
            module_id: modId,
            enabled_by: user.id,
          }, {
            onConflict: 'organization_id,module_id',
          });

        if (insertError) {
          return { success: false, error: insertError.message };
        }
      }

      await fetchModules();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [orgId, supabase, fetchModules]);

  const disableModule = useCallback(async (moduleId: ModuleId): Promise<{ success: boolean; error?: string }> => {
    // Use shared helper for dependency checking (single source of truth)
    const { canDisable, blockedBy } = canDisableModuleClient(moduleId, enabledModules);

    if (!canDisable) {
      return {
        success: false,
        error: blockedBy ? blockedBy.join(', ') : 'Cannot disable this module',
      };
    }

    try {
      const { error: deleteError } = await supabase
        .from('organization_modules')
        .delete()
        .eq('organization_id', orgId)
        .eq('module_id', moduleId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      await fetchModules();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [orgId, supabase, enabledModules, fetchModules]);

  const value: ModuleContextType = {
    enabledModules,
    loading,
    error,
    isModuleEnabled,
    canAccessRoute,
    refreshModules: fetchModules,
    enableModule,
    disableModule,
  };

  return (
    <ModuleContext.Provider value={value}>
      {children}
    </ModuleContext.Provider>
  );
}

/**
 * Hook to access module context
 */
export function useModules(): ModuleContextType {
  const context = useContext(ModuleContext);
  if (!context) {
    throw new Error('useModules must be used within a ModuleProvider');
  }
  return context;
}

/**
 * Conditional rendering component - only renders children if module is enabled
 */
export function ModuleGate({
  module,
  children,
  fallback = null,
}: {
  module: ModuleId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isModuleEnabled, loading } = useModules();

  if (loading) {
    return null;
  }

  if (!isModuleEnabled(module)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * Component to show module status badge
 */
export function ModuleStatusBadge({ moduleId }: { moduleId: ModuleId }) {
  const { isModuleEnabled } = useModules();
  const info = MODULE_INFO[moduleId];
  const enabled = isModuleEnabled(moduleId);

  return (
    <span
      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
        enabled
          ? 'bg-green-100 text-green-800'
          : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {info?.name || moduleId}
      {enabled && (
        <svg className="ml-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * Hook to check if current route requires a specific module
 */
export function useRouteModule(route: string): {
  requiredModule: ModuleId | null;
  isAccessible: boolean;
} {
  const { canAccessRoute } = useModules();

  // Use shared helper (single source of truth)
  const requiredModule = getRouteModule(route);

  return {
    requiredModule,
    isAccessible: canAccessRoute(route),
  };
}
