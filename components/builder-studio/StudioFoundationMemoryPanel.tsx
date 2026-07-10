'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Brain, Loader2, Plus } from 'lucide-react';
import StudioChangePreview from './StudioChangePreview';

interface StudioFoundationMemoryPanelProps { orgId: string; }

type ContextEntry = {
  id: string;
  context_type: 'operating_norm' | 'naming_convention' | 'process_rule' | 'preference';
  context_key: string;
  context_value: string;
  source: string;
  is_active: boolean;
};

const TYPE_LABELS: Record<ContextEntry['context_type'], string> = {
  operating_norm: 'Operating norm',
  naming_convention: 'Naming convention',
  process_rule: 'Process rule',
  preference: 'Preference',
};

export default function StudioFoundationMemoryPanel({ orgId }: StudioFoundationMemoryPanelProps) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ context_type: 'operating_norm' as ContextEntry['context_type'], context_key: '', context_value: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/org/${orgId}/ai-context`, { cache: 'no-store' });
      const data = await res.json() as { data?: ContextEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load Foundation Memory');
      setEntries(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Foundation Memory');
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/ai-context`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json().catch(() => ({})) as { data?: ContextEntry; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error || 'Failed to save Foundation Memory');
      setEntries((current) => [data.data!, ...current]);
      setForm({ context_type: 'operating_norm', context_key: '', context_value: '' });
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save Foundation Memory'); }
    finally { setSaving(false); }
  }

  async function toggleEntry(entry: ContextEntry) {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/ai-context`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: entry.id, is_active: !entry.is_active }) });
      const data = await res.json().catch(() => ({})) as { data?: ContextEntry; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error || 'Failed to update Foundation Memory');
      setEntries((current) => current.map((item) => item.id === entry.id ? data.data! : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to update Foundation Memory'); }
    finally { setSaving(false); }
  }

  return <section id="foundation-memory" className="scroll-mt-24 rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
    <div className="flex items-start gap-2"><Brain className="mt-0.5 h-4 w-4 text-azure" /><div><div className="text-sm font-semibold text-neutral-800">Foundation Memory</div><p className="mt-1 text-sm text-neutral-500">Keep the operating norms, language, and preferences that Builder and the AI assistant should carry into future work.</p></div></div>
    {error ? <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : null}
    <form onSubmit={addEntry} className="mt-4 grid gap-2 sm:grid-cols-2">
      <select value={form.context_type} onChange={(event) => setForm((current) => ({ ...current, context_type: event.target.value as ContextEntry['context_type'] }))} className="h-9 rounded-md border border-neutral-200 bg-white px-2 text-xs">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input value={form.context_key} onChange={(event) => setForm((current) => ({ ...current, context_key: event.target.value.replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '') }))} placeholder="short_key" required className="h-9 rounded-md border border-neutral-200 px-2 text-xs" />
      <textarea value={form.context_value} onChange={(event) => setForm((current) => ({ ...current, context_value: event.target.value }))} placeholder="What should the foundation remember?" required className="min-h-20 rounded-md border border-neutral-200 p-2 text-xs sm:col-span-2" />
      <button disabled={saving} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-azure px-3 text-xs font-medium text-white hover:bg-azure/90 disabled:opacity-50 sm:col-span-2"><Plus className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Add to Foundation Memory'}</button>
    </form>
    <div className="mt-3"><StudioChangePreview title="Foundation Memory preview" changes={form.context_value ? [{ label: form.context_key || 'New memory', before: 'Not recorded', after: form.context_value }] : []} /></div>
    {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="h-4 w-4 animate-spin" />Loading memory</div> : <div className="mt-4 divide-y divide-neutral-100">{entries.map((entry) => <div key={entry.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{TYPE_LABELS[entry.context_type]}</span><span className="font-mono text-xs text-neutral-400">{entry.context_key}</span></div><p className={`mt-1 text-sm ${entry.is_active ? 'text-neutral-700' : 'text-neutral-400 line-through'}`}>{entry.context_value}</p></div><button role="switch" aria-checked={entry.is_active} aria-label={`${entry.is_active ? 'Deactivate' : 'Activate'} ${entry.context_key}`} onClick={() => toggleEntry(entry)} disabled={saving} className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${entry.is_active ? 'bg-azure' : 'bg-neutral-300'} disabled:opacity-50`}><span className={`mt-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${entry.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} /></button></div>)}{entries.length === 0 ? <p className="py-3 text-sm text-neutral-500">No recorded norms yet.</p> : null}</div>}
  </section>;
}
