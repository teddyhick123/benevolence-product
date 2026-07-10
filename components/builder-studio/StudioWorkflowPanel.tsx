'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ListChecks, Loader2, Save } from 'lucide-react';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import StudioChangePreview from './StudioChangePreview';

interface StudioWorkflowPanelProps {
  orgId: string;
}

type WorkflowRow = {
  id: string;
  config_type: 'stage_checklist' | 'stage_label' | 'required_field' | 'approval_requirement';
  stage_key: string;
  config_key: string;
  config_value: Record<string, unknown>;
};

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StudioWorkflowPanel({ orgId }: StudioWorkflowPanelProps) {
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [initialLabels, setInitialLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [savedStage, setSavedStage] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/workflow-config`, { cache: 'no-store' });
      const data = await res.json() as { data?: WorkflowRow[]; error?: string };
      if (!res.ok) {
        if (res.status === 403 && data.error?.includes('not enabled')) { setModuleDisabled(true); return; }
        throw new Error(data.error || 'Failed to load workflow rules');
      }
      const loadedRows = data.data || [];
      setRows(loadedRows);
      setModuleDisabled(false);
      const loadedLabels = Object.fromEntries(loadedRows
        .filter((row) => row.config_type === 'stage_label')
        .map((row) => [row.stage_key, typeof row.config_value.value === 'string' ? row.config_value.value : '']));
      setLabels(loadedLabels);
      setInitialLabels(loadedLabels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow rules');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    checklist: rows.filter((row) => row.config_type === 'stage_checklist').length,
    required: rows.filter((row) => row.config_type === 'required_field').length,
    approvals: rows.filter((row) => row.config_type === 'approval_requirement').length,
  }), [rows]);
  const labelChanges = LIFECYCLE_STAGES.flatMap((stage) => {
    const before = initialLabels[stage] || stageLabel(stage);
    const after = labels[stage] || stageLabel(stage);
    return before === after ? [] : [{ label: stageLabel(stage), before, after }];
  });

  async function saveStage(stage: string) {
    setSavingStage(stage);
    setSavedStage(null);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/workflow-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_stage_label', stage_key: stage, label: labels[stage] || '' }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Workflow update failed');
      setSavedStage(stage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workflow update failed');
    } finally {
      setSavingStage(null);
    }
  }

  return (
    <section id="workflows" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800"><ListChecks className="h-4 w-4 text-azure" />Grant workflows</div>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">Name each stage in the foundation&apos;s own language. Builder can also add checklist gates, required fields, and approval guidance.</p>
        </div>
        {!loading && !moduleDisabled ? <div className="flex flex-wrap gap-1.5 text-xs text-neutral-500"><span className="rounded-full bg-neutral-100 px-2 py-1">{counts.checklist} checklist items</span><span className="rounded-full bg-neutral-100 px-2 py-1">{counts.required} field rules</span><span className="rounded-full bg-neutral-100 px-2 py-1">{counts.approvals} approvals</span></div> : null}
      </div>

      {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}
      {loading ? <div className="mt-4 flex items-center gap-2 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Loading workflow</div> : null}
      {moduleDisabled ? <div className="mt-4 rounded-md bg-neutral-50 p-4 text-sm text-neutral-500">Enable Grant Management in Modules to configure its workflow.</div> : null}

      {!loading && !moduleDisabled ? <div className="mt-5 grid gap-2 md:grid-cols-2">
        <div className="md:col-span-2"><StudioChangePreview title="Workflow change preview" changes={labelChanges} /></div>
        {LIFECYCLE_STAGES.map((stage) => (
          <div key={stage} className="flex items-center gap-2 rounded-md border border-neutral-200 p-2">
            <span className="w-24 shrink-0 truncate text-xs text-neutral-500" title={stageLabel(stage)}>{stageLabel(stage)}</span>
            <input aria-label={`${stageLabel(stage)} display name`} value={labels[stage] || ''} onChange={(event) => setLabels((current) => ({ ...current, [stage]: event.target.value }))} placeholder="System default" className="h-8 min-w-0 flex-1 rounded-md border border-neutral-200 px-2 text-xs" />
            <button onClick={() => saveStage(stage)} disabled={savingStage === stage} aria-label={`Save ${stageLabel(stage)} display name`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
              {savingStage === stage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedStage === stage ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))}
      </div> : null}
    </section>
  );
}
