'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase-browser';
import Link from 'next/link';
import {
  ChartBarIcon,
  DocumentTextIcon,
  CalculatorIcon,
  ClipboardDocumentCheckIcon,
  UsersIcon,
  GlobeAltIcon,
  ArrowTrendingUpIcon,
  FolderIcon,
  CheckIcon,
  ArrowLeftIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

type ModuleId =
  | 'core'
  | 'impact_tracking'
  | 'reporting'
  | 'tax_optimization'
  | 'grant_management'
  | 'donor_management'
  | 'external_data'
  | 'analytics';

interface ModuleInfo {
  id: ModuleId;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isCore: boolean;
  dependencies?: ModuleId[];
  features: string[];
}

const MODULES: ModuleInfo[] = [
  {
    id: 'core',
    name: 'Core',
    description: 'Basic portfolio and holding management - always enabled',
    icon: FolderIcon,
    isCore: true,
    features: ['Portfolio management', 'Holdings tracking', 'Team members', 'AI assistant basics'],
  },
  {
    id: 'impact_tracking',
    name: 'Impact Tracking',
    description: 'Track KPIs, visualize impact, and create custom dashboards',
    icon: ChartBarIcon,
    isCore: false,
    features: ['KPI metrics', 'Data visualization', 'Custom widgets', 'Trend analysis', 'Geographic mapping'],
  },
  {
    id: 'reporting',
    name: 'Reporting',
    description: 'Generate custom reports with inline charts and export capabilities',
    icon: DocumentTextIcon,
    isCore: false,
    dependencies: ['impact_tracking'],
    features: ['Custom reports', 'Report templates', 'PDF export', 'Data export (CSV, Excel)'],
  },
  {
    id: 'tax_optimization',
    name: 'Tax Optimization',
    description: 'Model tax scenarios and track charitable deductions',
    icon: CalculatorIcon,
    isCore: false,
    features: ['Tax scenarios', 'Deduction tracking', 'AGI limits', 'Carryforward management', 'Form 8283'],
  },
  {
    id: 'grant_management',
    name: 'Grant Management',
    description: 'Due diligence workflows, milestone tracking, and deadline management',
    icon: ClipboardDocumentCheckIcon,
    isCore: false,
    features: ['Due diligence checklists', 'Milestone tracking', 'Workflow automation', 'Reminders'],
  },
  {
    id: 'donor_management',
    name: 'Donor Management',
    description: 'Track contributions received and generate acknowledgment letters',
    icon: UsersIcon,
    isCore: false,
    features: ['Donor records', 'Contribution tracking', 'Tax receipts', 'Acknowledgment letters'],
  },
  {
    id: 'external_data',
    name: 'External Data',
    description: 'Pull data from Charity Navigator, Candid, and news sources',
    icon: GlobeAltIcon,
    isCore: false,
    features: ['Charity ratings', 'Financial data', 'News monitoring', 'Similar charity search'],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Advanced projections, benchmarking, and risk analysis',
    icon: ArrowTrendingUpIcon,
    isCore: false,
    dependencies: ['impact_tracking'],
    features: ['Metric projections', 'Peer benchmarking', 'Risk analysis', 'Monte Carlo simulations'],
  },
];

interface Preset {
  id: string;
  name: string;
  description: string;
  moduleIds: ModuleId[];
}

export default function ModuleSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;
  const supabase = createBrowserClient();

  const [enabledModules, setEnabledModules] = useState<Set<ModuleId>>(new Set(['core']));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ModuleId | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [orgId]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch org info
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    if (org) {
      setOrgName(org.name);
    }

    // Fetch enabled modules
    const { data: modules } = await supabase
      .from('organization_modules')
      .select('module_id')
      .eq('organization_id', orgId);

    if (modules) {
      const enabled = new Set<ModuleId>(['core']);
      modules.forEach((row: { module_id: string }) => enabled.add(row.module_id as ModuleId));
      setEnabledModules(enabled);
    }

    // Fetch presets
    const { data: presetData } = await supabase
      .from('module_presets')
      .select('*')
      .order('sort_order');

    if (presetData) {
      setPresets(presetData.map((p: { id: string; name: string; description: string; module_ids: string[] }) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        moduleIds: p.module_ids as ModuleId[],
      })));
    }

    setLoading(false);
  };

  const toggleModule = async (moduleId: ModuleId) => {
    const module = MODULES.find(m => m.id === moduleId);
    if (!module || module.isCore) return;

    setSaving(moduleId);
    const isEnabled = enabledModules.has(moduleId);

    try {
      if (isEnabled) {
        // Check for dependents before disabling
        const dependents = MODULES.filter(m =>
          m.dependencies?.includes(moduleId) && enabledModules.has(m.id)
        );

        if (dependents.length > 0) {
          alert(`Cannot disable ${module.name}: required by ${dependents.map(d => d.name).join(', ')}`);
          setSaving(null);
          return;
        }

        // Disable
        await supabase
          .from('organization_modules')
          .delete()
          .eq('organization_id', orgId)
          .eq('module_id', moduleId);

        setEnabledModules(prev => {
          const next = new Set(prev);
          next.delete(moduleId);
          return next;
        });
      } else {
        // Enable (and dependencies)
        const toEnable = [moduleId, ...(module.dependencies || [])];
        const { data: { user } } = await supabase.auth.getUser();

        for (const id of toEnable) {
          await supabase
            .from('organization_modules')
            .upsert({
              organization_id: orgId,
              module_id: id,
              enabled_by: user?.id,
            }, {
              onConflict: 'organization_id,module_id',
            });
        }

        setEnabledModules(prev => {
          const next = new Set(prev);
          toEnable.forEach(id => next.add(id));
          return next;
        });
      }
    } catch (err) {
      console.error('Error toggling module:', err);
    }

    setSaving(null);
  };

  const applyPreset = async (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    setApplyingPreset(presetId);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Clear existing modules
      await supabase
        .from('organization_modules')
        .delete()
        .eq('organization_id', orgId);

      // Enable preset modules
      for (const moduleId of preset.moduleIds) {
        await supabase
          .from('organization_modules')
          .insert({
            organization_id: orgId,
            module_id: moduleId,
            enabled_by: user?.id,
          });
      }

      // Update state
      const enabled = new Set<ModuleId>(['core', ...preset.moduleIds]);
      setEnabledModules(enabled);
    } catch (err) {
      console.error('Error applying preset:', err);
    }

    setApplyingPreset(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-azure" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/org/${orgId}/settings`}
            className="inline-flex items-center text-sm text-neutral-600 hover:text-neutral-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Settings
          </Link>
          <h1 className="text-2xl font-bold text-neutral-900">Module Settings</h1>
          <p className="text-neutral-600 mt-1">
            Configure which features are available for {orgName}. Only enabled modules
            will be accessible to Ben, your AI assistant.
          </p>
        </div>

        {/* Presets */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="h-5 w-5 text-azure" />
            <h2 className="text-lg font-semibold">Quick Setup</h2>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            Choose a preset configuration based on your organization type:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {presets.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id)}
                disabled={applyingPreset !== null}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  applyingPreset === preset.id
                    ? 'border-azure bg-azure/5'
                    : 'border-neutral-200 hover:border-azure/50 hover:bg-neutral-50'
                } disabled:opacity-50`}
              >
                <div className="font-medium text-neutral-900">{preset.name}</div>
                <div className="text-sm text-neutral-500 mt-1">{preset.description}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {preset.moduleIds.slice(0, 3).map(id => (
                    <span
                      key={id}
                      className="inline-block px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 rounded"
                    >
                      {MODULES.find(m => m.id === id)?.name}
                    </span>
                  ))}
                  {preset.moduleIds.length > 3 && (
                    <span className="inline-block px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 rounded">
                      +{preset.moduleIds.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Modules */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-lg font-semibold">Available Modules</h2>
            <p className="text-sm text-neutral-600">
              Enable or disable individual modules
            </p>
          </div>

          <div className="divide-y divide-neutral-100">
            {MODULES.map(module => {
              const Icon = module.icon;
              const isEnabled = enabledModules.has(module.id);
              const isSaving = saving === module.id;

              return (
                <div
                  key={module.id}
                  className={`p-6 ${module.isCore ? 'bg-neutral-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div
                        className={`p-3 rounded-lg ${
                          isEnabled
                            ? 'bg-azure text-white'
                            : 'bg-neutral-100 text-neutral-400'
                        }`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-neutral-900">{module.name}</h3>
                          {module.isCore && (
                            <span className="px-2 py-0.5 text-xs bg-neutral-200 text-neutral-600 rounded">
                              Always enabled
                            </span>
                          )}
                          {module.dependencies && module.dependencies.length > 0 && (
                            <span className="text-xs text-neutral-500">
                              Requires: {module.dependencies.map(d =>
                                MODULES.find(m => m.id === d)?.name
                              ).join(', ')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{module.description}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {module.features.map((feature, idx) => (
                            <span
                              key={idx}
                              className={`inline-block px-2 py-1 text-xs rounded-full ${
                                isEnabled
                                  ? 'bg-azure/10 text-azure'
                                  : 'bg-neutral-100 text-neutral-500'
                              }`}
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Toggle */}
                    <button
                      onClick={() => toggleModule(module.id)}
                      disabled={module.isCore || isSaving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isEnabled ? 'bg-azure' : 'bg-neutral-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="sr-only">
                        {isEnabled ? 'Disable' : 'Enable'} {module.name}
                      </span>
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      >
                        {isSaving && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-azure border-t-transparent" />
                          </span>
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="mt-8 p-6 bg-azure/5 rounded-xl border border-azure/20">
          <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
            <CheckIcon className="h-5 w-5 text-azure" />
            Current Configuration
          </h3>
          <p className="text-sm text-neutral-600 mt-2">
            {enabledModules.size} modules enabled: {Array.from(enabledModules).map(id =>
              MODULES.find(m => m.id === id)?.name
            ).join(', ')}
          </p>
          <p className="text-sm text-neutral-500 mt-2">
            Ben will have access to all tools from these modules when assisting with your portfolio.
          </p>
        </div>
      </div>
    </div>
  );
}
