'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Puzzle } from 'lucide-react';
import type { ModuleId } from '@/lib/modules/types';
import { canDisableModuleClient, getAllModuleInfo, getModuleInfo } from '@/lib/modules/client-info';
import StudioChangePreview from './StudioChangePreview';

interface StudioModulesPanelProps {
  orgId: string;
}

type ModulesResponse = {
  enabledModules?: ModuleId[];
  error?: string;
};

export default function StudioModulesPanel({ orgId }: StudioModulesPanelProps) {
  const [enabledModules, setEnabledModules] = useState<ModuleId[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingModule, setSavingModule] = useState<ModuleId | null>(null);
  const [pendingChange, setPendingChange] = useState<{ moduleId: ModuleId; enabled: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modules = useMemo(() => getAllModuleInfo(), []);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/modules`, { cache: 'no-store' });
      const data = await res.json() as ModulesResponse;
      if (!res.ok) throw new Error(data.error || 'Failed to load modules');
      setEnabledModules(data.enabledModules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  async function toggleModule(moduleId: ModuleId, enabled: boolean) {
    setSavingModule(moduleId);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: enabled ? 'disable' : 'enable', moduleId }),
      });
      const data = await res.json().catch(() => ({})) as ModulesResponse;
      if (!res.ok) throw new Error(data.error || 'Module update failed');
      await loadModules();
      setPendingChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Module update failed');
    } finally {
      setSavingModule(null);
    }
  }

  return (
    <section id="modules" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Puzzle className="h-4 w-4 text-azure" />
            Modules
          </div>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Choose the capabilities this foundation uses. Dependency rules are enforced automatically.
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
          {enabledModules.filter((id) => id !== 'core').length} enabled
        </span>
      </div>

      {error ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {pendingChange ? (() => {
        const moduleInfo = getModuleInfo(pendingChange.moduleId);
        const dependencyNames = (moduleInfo?.dependencies || []).map((id) => getModuleInfo(id)?.name || id).join(', ');
        return <div className="mt-4 space-y-3">
          <StudioChangePreview title="Module change preview" changes={[{ label: moduleInfo?.name || pendingChange.moduleId, before: pendingChange.enabled ? 'Enabled' : 'Disabled', after: pendingChange.enabled ? 'Disabled' : 'Enabled' }]} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500"><span>{pendingChange.enabled && dependencyNames ? `Disabling may affect ${dependencyNames}.` : 'Module dependency rules will be checked before this change is applied.'}</span><div className="flex gap-2"><button onClick={() => setPendingChange(null)} className="h-8 rounded-md border border-neutral-200 px-3 font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button><button onClick={() => toggleModule(pendingChange.moduleId, pendingChange.enabled)} className="h-8 rounded-md bg-azure px-3 font-medium text-white hover:bg-azure/90">Apply change</button></div></div>
        </div>;
      })() : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading modules
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const enabled = enabledModules.includes(module.id);
            const disableState = canDisableModuleClient(module.id, enabledModules);
            const dependencyNames = (module.dependencies || [])
              .map((id) => getModuleInfo(id)?.name || id)
              .join(', ');
            const disabled = module.isCore || savingModule === module.id || (enabled && !disableState.canDisable);

            return (
              <div key={module.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-neutral-900">{module.name}</h3>
                      {enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{module.description}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${module.name}`}
                    onClick={() => setPendingChange({ moduleId: module.id, enabled })}
                    disabled={disabled}
                    className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-azure focus:ring-offset-1 ${
                      enabled ? 'bg-azure' : 'bg-neutral-300'
                    } ${disabled ? 'opacity-50' : ''}`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {dependencyNames ? (
                  <div className="mt-3 text-xs text-neutral-500">Requires {dependencyNames}</div>
                ) : null}
                {enabled && disableState.blockedBy?.length ? (
                  <div className="mt-2 text-xs text-amber-700">
                    Required by {disableState.blockedBy.join(', ')}
                  </div>
                ) : null}
                {module.isCore ? (
                  <div className="mt-2 text-xs text-neutral-400">Always enabled</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
