'use client';
// components/admin/MappingGrid.tsx
// Visual field mapping editor — source CSV columns → Benevolence fields

import { useState } from 'react';
import type { EntityMappingConfig } from '@/lib/import/types';

export interface TargetField {
  field: string;
  label: string;
  required: boolean;
  entity: string;
  type?: string;
}

export interface MappingSuggestion {
  sourceField: string;
  targetField: string;
  confidence: number;
}

interface MappingGridProps {
  entity: string;
  sourceFields: string[];
  targetFields: TargetField[];
  existingMapping: EntityMappingConfig;
  suggestions?: MappingSuggestion[];
  onChange: (mapping: EntityMappingConfig) => void;
  onSave?: (mapping: EntityMappingConfig) => Promise<void>;
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;

  const pct = Math.round(confidence * 100);
  const color =
    confidence >= 0.9
      ? 'bg-green-50 text-green-700 border-green-200'
      : confidence >= 0.75
      ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
      : 'bg-neutral-100 text-neutral-500 border-neutral-200';

  const dot = confidence >= 0.9 ? '●' : '○';

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color}`}
    >
      <span>{dot}</span>
      {pct}% match
    </span>
  );
}

export function MappingGrid({
  entity,
  sourceFields,
  targetFields,
  existingMapping,
  suggestions = [],
  onChange,
  onSave,
}: MappingGridProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  // Build a reverse map: targetField → sourceField from existing mapping
  const targetToSource: Record<string, string> = {};
  for (const [targetField, config] of Object.entries(existingMapping.field_map ?? {})) {
    if (config.source) targetToSource[targetField] = config.source;
  }

  // Build a direct source→target assignment for the grid
  // sourceField → targetField | '__ignore__'
  const initialAssignments: Record<string, string> = {};
  for (const sf of sourceFields) {
    // Check if this source field is mapped to any target
    const mapped = Object.entries(existingMapping.field_map ?? {}).find(
      ([, cfg]) => cfg.source === sf
    );
    if (mapped) {
      initialAssignments[sf] = mapped[0];
    } else {
      initialAssignments[sf] = '__ignore__';
    }
  }

  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);

  const suggestionMap: Record<string, MappingSuggestion> = {};
  for (const s of suggestions) {
    suggestionMap[s.sourceField] = s;
  }

  const handleAssign = (sourceField: string, targetField: string) => {
    const newAssignments = { ...assignments, [sourceField]: targetField };
    setAssignments(newAssignments);

    // Build updated EntityMappingConfig
    const newFieldMap: EntityMappingConfig['field_map'] = { ...existingMapping.field_map };

    // Remove old mapping for this source field
    for (const [tf, cfg] of Object.entries(newFieldMap)) {
      if (cfg.source === sourceField) {
        delete newFieldMap[tf];
      }
    }

    // Remove old mapping for the newly selected target (avoid double-mapping)
    if (targetField !== '__ignore__' && newFieldMap[targetField]) {
      delete newFieldMap[targetField];
    }

    if (targetField !== '__ignore__') {
      const existingTargetDef = targetFields.find((t) => t.field === targetField);
      newFieldMap[targetField] = {
        source: sourceField,
        type: (existingTargetDef?.type as EntityMappingConfig['field_map'][string]['type']) ?? 'string',
        required: existingTargetDef?.required ?? false,
        confidence: suggestionMap[sourceField]?.confidence,
      };
    }

    onChange({ ...existingMapping, field_map: newFieldMap });
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      await onSave({ ...existingMapping, field_map: buildCurrentFieldMap() });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const buildCurrentFieldMap = (): EntityMappingConfig['field_map'] => {
    const fieldMap: EntityMappingConfig['field_map'] = {};
    for (const [sf, tf] of Object.entries(assignments)) {
      if (tf === '__ignore__') continue;
      const existingTargetDef = targetFields.find((t) => t.field === tf);
      fieldMap[tf] = {
        source: sf,
        type: (existingTargetDef?.type as EntityMappingConfig['field_map'][string]['type']) ?? 'string',
        required: existingTargetDef?.required ?? false,
        confidence: suggestionMap[sf]?.confidence,
      };
    }
    return fieldMap;
  };

  const unmappedRequired = targetFields.filter(
    (tf) => tf.required && !Object.values(assignments).includes(tf.field)
  );

  return (
    <div className="space-y-4">
      {unmappedRequired.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Required fields not mapped:{' '}
          <span className="font-medium">{unmappedRequired.map((f) => f.label).join(', ')}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50">
              <th className="text-left px-4 py-2.5 font-medium text-neutral-600 w-5/12">
                Source Field (CSV)
              </th>
              <th className="text-center px-2 py-2.5 text-neutral-400">→</th>
              <th className="text-left px-4 py-2.5 font-medium text-neutral-600 w-5/12">
                {entity.charAt(0).toUpperCase() + entity.slice(1)} Field
              </th>
              <th className="text-right px-4 py-2.5 font-medium text-neutral-600 w-2/12">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {sourceFields.map((sf) => {
              const currentTarget = assignments[sf] ?? '__ignore__';
              const suggestion = suggestionMap[sf];
              const isRequired =
                currentTarget !== '__ignore__' &&
                targetFields.find((t) => t.field === currentTarget)?.required;

              return (
                <tr
                  key={sf}
                  className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 rounded">
                      {sf}
                    </span>
                  </td>
                  <td className="text-center text-neutral-300 px-2">→</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={currentTarget}
                      onChange={(e) => handleAssign(sf, e.target.value)}
                      className={`w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-azure/30 ${
                        isRequired
                          ? 'border-azure/30 bg-azure/5'
                          : 'border-neutral-200'
                      }`}
                    >
                      <option value="__ignore__">-- ignore --</option>
                      {targetFields.map((tf) => (
                        <option key={tf.field} value={tf.field}>
                          {tf.label}
                          {tf.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ConfidenceBadge confidence={suggestion?.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {onSave && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-neutral-500">
            {Object.values(assignments).filter((v) => v !== '__ignore__').length} of{' '}
            {sourceFields.length} fields mapped
          </div>
          <div className="flex items-center gap-2">
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            {savedOk && <p className="text-xs text-green-600">Saved!</p>}
            <button
              onClick={handleSave}
              disabled={saving || unmappedRequired.length > 0}
              className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Saving…' : 'Save Mapping'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
