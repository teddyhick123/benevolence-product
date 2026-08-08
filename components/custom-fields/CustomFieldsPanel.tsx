'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useMemo, useState } from 'react';

type FieldType = 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'enum';

type CustomField = {
  id: string;
  field_key: string;
  field_label: string;
  field_type: FieldType;
  enum_options: Array<{ value: string; label: string }> | null;
  required_at_stage: string | null;
  value: string | number | boolean | null;
};

interface Props {
  orgId: string;
  entityType: 'grant' | 'holding' | 'donor' | 'contribution';
  entityId: string;
  title?: string;
}

export default function CustomFieldsPanel({ orgId, entityType, entityId, title = 'Custom Fields' }: Props) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiRequest(`/api/org/${orgId}/custom-fields/values?entity_type=${entityType}&entity_id=${entityId}`)
      .then(async res => {
        const json = await readJson(res).catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Failed to load custom fields');
        return json;
      })
      .then(json => {
        if (cancelled) return;
        const nextFields = (json.fields ?? []) as CustomField[];
        setFields(nextFields);
        setValues(Object.fromEntries(nextFields.map(field => [field.field_key, field.value ?? ''])));
        setDirty(false);
      })
      .catch(err => {
        if (!cancelled) setError(err?.message ?? 'Failed to load custom fields');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, entityType, entityId]);

  const hasRequiredFields = useMemo(() => fields.some(field => field.required_at_stage), [fields]);

  function patchValue(fieldKey: string, value: unknown) {
    setValues(current => ({ ...current, [fieldKey]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest(`/api/org/${orgId}/custom-fields/values`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, values }),
      });
      const json = await readJson(res).catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to save custom fields');
      const nextFields = (json.fields ?? []) as CustomField[];
      setFields(nextFields);
      setValues(Object.fromEntries(nextFields.map(field => [field.field_key, field.value ?? ''])));
      setDirty(false);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save custom fields');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  if (fields.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {hasRequiredFields && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Stage gated
          </span>
        )}
      </div>

      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.id}>
            <label className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-gray-500">
              <span>{field.field_label}</span>
              {field.required_at_stage && (
                <span className="font-normal text-amber-600">
                  Required at {field.required_at_stage.replace(/_/g, ' ')}
                </span>
              )}
            </label>
            {field.field_type === 'boolean' ? (
              <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={values[field.field_key] === true}
                  onChange={e => patchValue(field.field_key, e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-azure focus:ring-azure/30"
                />
                Yes
              </label>
            ) : field.field_type === 'enum' ? (
              <select
                value={String(values[field.field_key] ?? '')}
                onChange={e => patchValue(field.field_key, e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              >
                <option value="">Not set</option>
                {(field.enum_options ?? []).map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.field_type === 'date' ? 'date' : field.field_type === 'text' ? 'text' : 'number'}
                step={field.field_type === 'integer' ? '1' : field.field_type === 'decimal' ? 'any' : undefined}
                value={String(values[field.field_key] ?? '')}
                onChange={e => patchValue(field.field_key, e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-azure px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-azure/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
