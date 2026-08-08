'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Eye, Loader2, Save } from 'lucide-react';
import {
  DASHBOARD_SECTION_IDS,
  DEFAULT_ENTITY_VOCABULARY,
  GRANT_MODULE_VIEWS,
  type EntityVocabularyType,
} from '@/lib/view-config';
import StudioChangePreview from './StudioChangePreview';

interface StudioViewsPanelProps {
  orgId: string;
}

type ViewConfigRow = {
  config_scope: string;
  scope_key: string;
  config_value: Record<string, unknown>;
};

type Vocabulary = Record<EntityVocabularyType, { singular: string; plural: string }>;

const SECTION_LABELS: Record<(typeof DASHBOARD_SECTION_IDS)[number], string> = {
  tasks: 'Tasks',
  summary: 'Summary',
  kpis: 'Key metrics',
  payout: 'Payout',
  holdings_widgets: 'Portfolio insights',
  grants: 'Grants',
  map: 'Map',
};

function formatView(view: string) {
  return view.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudioViewsPanel({ orgId }: StudioViewsPanelProps) {
  const [sections, setSections] = useState<string[]>([...DASHBOARD_SECTION_IDS]);
  const [grantView, setGrantView] = useState<(typeof GRANT_MODULE_VIEWS)[number]>('pipeline');
  const [vocabulary, setVocabulary] = useState<Vocabulary>(DEFAULT_ENTITY_VOCABULARY);
  const [initialSections, setInitialSections] = useState<string[]>([...DASHBOARD_SECTION_IDS]);
  const [initialGrantView, setInitialGrantView] = useState<(typeof GRANT_MODULE_VIEWS)[number]>('pipeline');
  const [initialVocabulary, setInitialVocabulary] = useState<Vocabulary>(DEFAULT_ENTITY_VOCABULARY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSections = useMemo(() => new Set(sections), [sections]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest(`/api/org/${orgId}/view-config?include_vocabulary=true`, { cache: 'no-store' });
        const data = await readJson(res) as { configs?: ViewConfigRow[]; vocabulary?: Vocabulary; error?: string };
        if (!res.ok) throw new Error(data.error || 'Failed to load views');
        if (cancelled) return;
        const dashboard = data.configs?.find((row) => row.config_scope === 'dashboard' && row.scope_key === 'main');
        const configuredSections = dashboard?.config_value.sections;
        const hiddenSections = Array.isArray(dashboard?.config_value.hidden_sections)
          ? dashboard.config_value.hidden_sections
          : [];
        if (Array.isArray(configuredSections)) {
          const visibleSections = configuredSections.filter((section): section is string => typeof section === 'string' && !hiddenSections.includes(section));
          setSections(visibleSections);
          setInitialSections(visibleSections);
        }
        const moduleDefault = data.configs?.find((row) => row.config_scope === 'module_default' && row.scope_key === 'grant_module');
        if (typeof moduleDefault?.config_value.default_view === 'string' && GRANT_MODULE_VIEWS.includes(moduleDefault.config_value.default_view as any)) {
          setGrantView(moduleDefault.config_value.default_view as (typeof GRANT_MODULE_VIEWS)[number]);
          setInitialGrantView(moduleDefault.config_value.default_view as (typeof GRANT_MODULE_VIEWS)[number]);
        }
        if (data.vocabulary) { setVocabulary(data.vocabulary); setInitialVocabulary(data.vocabulary); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load views');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  async function save(key: string, payload: Record<string, unknown>) {
    setSaving(key);
    setSaved(null);
    setError(null);
    try {
      const res = await apiRequest(`/api/org/${orgId}/view-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(res).catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'View update failed');
      setSaved(key);
      if (key === 'dashboard') setInitialSections(sections);
      if (key === 'grant-view') setInitialGrantView(grantView);
      if (key.startsWith('vocabulary-')) setInitialVocabulary(vocabulary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'View update failed');
    } finally {
      setSaving(null);
    }
  }

  function toggleSection(section: string) {
    setSections((current) => current.includes(section)
      ? current.filter((item) => item !== section)
      : [...current, section]);
  }

  const viewChanges = [
    initialSections.join(', ') !== sections.join(', ') ? { label: 'Dashboard sections', before: initialSections.map((section) => SECTION_LABELS[section as keyof typeof SECTION_LABELS] || section).join(', '), after: sections.map((section) => SECTION_LABELS[section as keyof typeof SECTION_LABELS] || section).join(', ') } : null,
    initialGrantView !== grantView ? { label: 'Grant landing view', before: formatView(initialGrantView), after: formatView(grantView) } : null,
    ...(Object.keys(DEFAULT_ENTITY_VOCABULARY) as EntityVocabularyType[]).flatMap((entity) => initialVocabulary[entity].singular !== vocabulary[entity].singular || initialVocabulary[entity].plural !== vocabulary[entity].plural ? [{ label: `${entity} vocabulary`, before: `${initialVocabulary[entity].singular} / ${initialVocabulary[entity].plural}`, after: `${vocabulary[entity].singular} / ${vocabulary[entity].plural}` }] : []),
  ].filter((change): change is { label: string; before: string; after: string } => change !== null);

  return (
    <section id="views" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Eye className="h-4 w-4 text-azure" />
            Dashboards &amp; Views
          </div>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Decide what the team sees when they arrive, how grants open, and the language used across the workspace.
          </p>
        </div>
      </div>

      {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Loading views</div>
      ) : (
        <div className="mt-5 space-y-6">
          <StudioChangePreview title="View change preview" changes={viewChanges} />
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-900">Main dashboard</h3>
              <button
                onClick={() => save('dashboard', { config_scope: 'dashboard', scope_key: 'main', config_value: { sections: sections.length ? sections : [...DASHBOARD_SECTION_IDS], hidden_sections: DASHBOARD_SECTION_IDS.filter((section) => !selectedSections.has(section)) } })}
                disabled={saving === 'dashboard'}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                {saving === 'dashboard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === 'dashboard' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}
                Save dashboard
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DASHBOARD_SECTION_IDS.map((section) => {
                const checked = selectedSections.has(section);
                return <button key={section} role="switch" aria-checked={checked} onClick={() => toggleSection(section)} className="flex min-h-10 items-center justify-between rounded-md border border-neutral-200 px-3 text-left text-sm hover:bg-neutral-50">
                  <span>{SECTION_LABELS[section]}</span>
                  <span className={`relative inline-flex h-5 w-9 rounded-full ${checked ? 'bg-azure' : 'bg-neutral-300'}`}><span className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} /></span>
                </button>;
              })}
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Grant landing view</h3>
                <p className="mt-1 text-xs text-neutral-500">The default view when staff open Grants.</p>
              </div>
              <div className="flex items-center gap-2">
                <select value={grantView} onChange={(event) => setGrantView(event.target.value as (typeof GRANT_MODULE_VIEWS)[number])} className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-700">
                  {GRANT_MODULE_VIEWS.map((view) => <option key={view} value={view}>{formatView(view)}</option>)}
                </select>
                <button onClick={() => save('grant-view', { config_scope: 'module_default', scope_key: 'grant_module', config_value: { default_view: grantView } })} disabled={saving === 'grant-view'} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                  {saving === 'grant-view' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === 'grant-view' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />} Save
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-semibold text-neutral-900">Workspace vocabulary</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(Object.keys(DEFAULT_ENTITY_VOCABULARY) as EntityVocabularyType[]).map((entity) => (
                <div key={entity} className="rounded-md border border-neutral-200 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label={`${entity} singular`} value={vocabulary[entity].singular} onChange={(event) => setVocabulary((current) => ({ ...current, [entity]: { ...current[entity], singular: event.target.value } }))} className="h-8 min-w-0 rounded-md border border-neutral-200 px-2 text-xs" placeholder="Singular" />
                    <input aria-label={`${entity} plural`} value={vocabulary[entity].plural} onChange={(event) => setVocabulary((current) => ({ ...current, [entity]: { ...current[entity], plural: event.target.value } }))} className="h-8 min-w-0 rounded-md border border-neutral-200 px-2 text-xs" placeholder="Plural" />
                  </div>
                  <button onClick={() => save(`vocabulary-${entity}`, { config_scope: 'entity_vocabulary', scope_key: `entity.${entity}`, config_value: vocabulary[entity] })} disabled={saving === `vocabulary-${entity}`} className="mt-2 inline-flex h-7 items-center gap-1 text-xs font-medium text-azure hover:text-azure/80 disabled:opacity-50">
                    {saving === `vocabulary-${entity}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === `vocabulary-${entity}` ? <Check className="h-3.5 w-3.5" /> : null} Save {entity}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
