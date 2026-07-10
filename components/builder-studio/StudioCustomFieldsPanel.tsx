'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ListPlus, Loader2, Plus } from 'lucide-react';
import StudioChangePreview from './StudioChangePreview';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';

interface StudioCustomFieldsPanelProps { orgId: string; }

type EntityType = 'grant' | 'holding' | 'donor' | 'contribution';
type FieldType = 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'enum';
type CustomField = { id: string; entity_type: EntityType; field_key: string; field_label: string; field_type: FieldType; required_at_stage: string | null; is_ai_readable: boolean; };
type FieldForm = { entity_type: EntityType; field_label: string; field_type: FieldType; enumOptions: string; requiredAtStage: string; isAiReadable: boolean; };

const EMPTY_FORM: FieldForm = { entity_type: 'grant', field_label: '', field_type: 'text', enumOptions: '', requiredAtStage: '', isAiReadable: true };

export default function StudioCustomFieldsPanel({ orgId }: StudioCustomFieldsPanelProps) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/custom-fields`, { cache: 'no-store' });
      const data = await res.json() as { data?: CustomField[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load custom fields');
      setFields(data.data || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load custom fields'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function createField(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const enumOptions = form.field_type === 'enum'
        ? form.enumOptions.split(',').map((option) => option.trim()).filter(Boolean).map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label }))
        : undefined;
      if (form.field_type === 'enum' && (!enumOptions || enumOptions.length === 0)) {
        throw new Error('Add at least one comma-separated option for a select field');
      }
      const payload = {
        entity_type: form.entity_type,
        field_label: form.field_label,
        field_type: form.field_type,
        enum_options: enumOptions,
        required_at_stage: form.entity_type === 'grant' && form.requiredAtStage ? form.requiredAtStage : null,
        is_ai_readable: form.isAiReadable,
      };
      const res = await fetch(`/api/org/${orgId}/custom-fields`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({})) as { data?: CustomField; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error || 'Failed to create custom field');
      setFields((current) => [...current, data.data!]);
      setForm(EMPTY_FORM);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create custom field'); }
    finally { setSaving(false); }
  }

  return <section id="custom-fields" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
    <div className="flex items-start gap-2"><ListPlus className="mt-0.5 h-4 w-4 text-azure" /><div><div className="text-sm font-semibold text-neutral-800">Custom Fields</div><p className="mt-1 text-sm text-neutral-500">Add typed information your staff needs to record, including select options, stage requirements, and AI-readable fields.</p></div></div>
    {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : null}
    <form onSubmit={createField} className="mt-4 grid gap-2 sm:grid-cols-[8rem_1fr_7rem_auto]">
      <select value={form.entity_type} onChange={(event) => setForm((current) => ({ ...current, entity_type: event.target.value as EntityType }))} className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs"><option value="grant">Grant</option><option value="holding">Holding</option><option value="donor">Donor</option><option value="contribution">Contribution</option></select>
      <input value={form.field_label} onChange={(event) => setForm((current) => ({ ...current, field_label: event.target.value }))} placeholder="Field name" required className="h-9 min-w-0 rounded-md border border-neutral-200 px-2 text-xs" />
      <select value={form.field_type} onChange={(event) => setForm((current) => ({ ...current, field_type: event.target.value as FieldType }))} className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs"><option value="text">Text</option><option value="integer">Number</option><option value="decimal">Decimal</option><option value="boolean">Yes / no</option><option value="date">Date</option><option value="enum">Select</option></select>
      <button disabled={saving} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add</button>
      {form.field_type === 'enum' ? <input value={form.enumOptions} onChange={(event) => setForm((current) => ({ ...current, enumOptions: event.target.value }))} placeholder="Select options, comma separated" className="h-9 rounded-md border border-neutral-200 px-2 text-xs sm:col-span-4" /> : null}
      {form.entity_type === 'grant' ? <select value={form.requiredAtStage} onChange={(event) => setForm((current) => ({ ...current, requiredAtStage: event.target.value }))} className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs sm:col-span-2"><option value="">Not required at a stage</option>{LIFECYCLE_STAGES.map((stage) => <option key={stage} value={stage}>Required before leaving {stage.replace(/_/g, ' ')}</option>)}</select> : null}
      <label className="flex h-9 items-center gap-2 text-xs text-neutral-600 sm:col-span-2"><input type="checkbox" checked={form.isAiReadable} onChange={(event) => setForm((current) => ({ ...current, isAiReadable: event.target.checked }))} className="h-4 w-4 rounded border-neutral-300 text-azure focus:ring-azure" />AI can read this field</label>
    </form>
    <div className="mt-3"><StudioChangePreview title="Custom field preview" changes={form.field_label ? [{ label: 'New field', before: 'Not configured', after: `${form.entity_type}: ${form.field_label} (${form.field_type}${form.requiredAtStage ? `, required at ${form.requiredAtStage}` : ''})` }] : []} /></div>
    {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Loading fields</div> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{fields.map((field) => <div key={field.id} className="rounded-md border border-neutral-200 px-3 py-2"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-neutral-800">{field.field_label}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{field.entity_type}</span></div><div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500"><span>{field.field_type}</span>{field.required_at_stage ? <span>Required at {field.required_at_stage.replace(/_/g, ' ')}</span> : null}{field.is_ai_readable ? <span>AI readable</span> : null}</div></div>)}{fields.length === 0 ? <p className="text-sm text-neutral-500">No custom fields yet.</p> : null}</div>}
  </section>;
}
