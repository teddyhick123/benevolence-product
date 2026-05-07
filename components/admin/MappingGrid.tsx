'use client';
// components/admin/MappingGrid.tsx
// Visual field mapping editor — source CSV columns → Benevolence fields

import { useState } from 'react';
import type { EntityMappingConfig } from '@/lib/import/types';
import type { MappingAssistResult } from '@/lib/import/ai/mapping-assist';
import { AIConfidenceBadge } from './AIConfidenceBadge';

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
  aiSuggestions?: MappingAssistResult;
  onRequestAISuggestions?: () => void;
  isLoadingAI?: boolean;
  onChange: (mapping: EntityMappingConfig) => void;
  onSave?: (mapping: EntityMappingConfig) => Promise<void>;
}

export function MappingGrid({
  entity,
  sourceFields,
  targetFields,
  existingMapping,
  suggestions = [],
  aiSuggestions,
  onRequestAISuggestions,
  isLoadingAI = false,
  onChange,
  onSave,
}: MappingGridProps) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Build a direct source→target assignment for the grid
  const initialAssignments: Record<string, string> = {};
  for (const sf of sourceFields) {
    const mapped = Object.entries(existingMapping.field_map ?? {}).find(
      ([, cfg]) => cfg.source === sf
    );
    if (mapped) {
      initialAssignments[sf] = mapped[0];
    } else {
      // Check AI suggestions for auto-population
      const aiMatch = aiSuggestions?.mappings.find((m) => m.sourceField === sf);
      initialAssignments[sf] = aiMatch ? aiMatch.targetField : '__ignore__';
    }
  }

  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);

  // Legacy suggestions map
  const suggestionMap: Record<string, MappingSuggestion> = {};
  for (const s of suggestions) {
    suggestionMap[s.sourceField] = s;
  }

  type AIMappingSuggestion = MappingAssistResult['mappings'][number];

  // AI suggestions keyed by targetField
  const aiByTarget: Record<string, AIMappingSuggestion> = {};
  if (aiSuggestions) {
    for (const m of aiSuggestions.mappings) {
      aiByTarget[m.targetField] = m;
    }
  }

  // AI suggestions keyed by sourceField
  const aiBySource: Record<string, AIMappingSuggestion> = {};
  if (aiSuggestions) {
    for (const m of aiSuggestions.mappings) {
      aiBySource[m.sourceField] = m;
    }
  }

  const handleAssign = (sourceField: string, targetField: string) => {
    const newAssignments = { ...assignments, [sourceField]: targetField };
    setAssignments(newAssignments);

    const newFieldMap: EntityMappingConfig['field_map'] = { ...existingMapping.field_map };

    for (const [tf, cfg] of Object.entries(newFieldMap)) {
      if (cfg.source === sourceField) {
        delete newFieldMap[tf];
      }
    }

    if (targetField !== '__ignore__' && newFieldMap[targetField]) {
      delete newFieldMap[targetField];
    }

    if (targetField !== '__ignore__') {
      const existingTargetDef = targetFields.find((t) => t.field === targetField);
      const aiConf = aiBySource[sourceField]?.confidence ?? suggestionMap[sourceField]?.confidence;
      newFieldMap[targetField] = {
        source: sourceField,
        type: (existingTargetDef?.type as EntityMappingConfig['field_map'][string]['type']) ?? 'string',
        required: existingTargetDef?.required ?? false,
        confidence: aiConf,
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
      const aiConf = aiBySource[sf]?.confidence ?? suggestionMap[sf]?.confidence;
      fieldMap[tf] = {
        source: sf,
        type: (existingTargetDef?.type as EntityMappingConfig['field_map'][string]['type']) ?? 'string',
        required: existingTargetDef?.required ?? false,
        confidence: aiConf,
      };
    }
    return fieldMap;
  };

  const toggleExpand = (sf: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(sf)) next.delete(sf);
      else next.add(sf);
      return next;
    });
  };

  const unmappedRequired = targetFields.filter(
    (tf) => tf.required && !Object.values(assignments).includes(tf.field)
  );

  // AI banner stats
  const highConfidence = aiSuggestions?.mappings.filter((m) => m.confidence >= 0.85).length ?? 0;
  const needsReview = (aiSuggestions?.mappings.length ?? 0) - highConfidence;

  return (
    <div className="space-y-4">
      {/* AI controls */}
      <div className="flex items-center justify-between">
        {onRequestAISuggestions && (
          <button
            onClick={onRequestAISuggestions}
            disabled={isLoadingAI}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-azure/30 bg-azure/5 text-azure rounded-md hover:bg-azure/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoadingAI ? (
              <>
                <span className="animate-spin">⟳</span>
                AI is analyzing your data…
              </>
            ) : (
              <>
                ✦ Ask AI
              </>
            )}
          </button>
        )}
        <div />
      </div>

      {/* AI suggestions banner */}
      {aiSuggestions && (
        <div className="p-3 bg-azure/5 border border-azure/20 rounded-lg text-sm text-azure flex items-center gap-2">
          <span>✦</span>
          <span>
            AI analyzed {aiSuggestions.mappings.length} fields.{' '}
            <strong>{highConfidence} mapped with high confidence (≥85%)</strong>
            {needsReview > 0 && `, ${needsReview} need review`}.
          </span>
        </div>
      )}

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
              const aiSug = aiBySource[sf];
              const legacySug = suggestionMap[sf];
              const confidence = aiSug?.confidence ?? legacySug?.confidence;
              const isRequired =
                currentTarget !== '__ignore__' &&
                targetFields.find((t) => t.field === currentTarget)?.required;
              const isExpanded = expandedRows.has(sf);

              return (
                <>
                  <tr
                    key={sf}
                    className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 rounded">
                          {sf}
                        </span>
                        {aiSug?.reason && (
                          <button
                            onClick={() => toggleExpand(sf)}
                            className="text-xs text-azure/60 hover:text-azure transition-colors"
                            title="Show AI reasoning"
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </div>
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
                      <AIConfidenceBadge confidence={confidence} />
                    </td>
                  </tr>
                  {isExpanded && aiSug?.reason && (
                    <tr key={`${sf}-reason`} className="bg-azure/5 border-b border-azure/10">
                      <td colSpan={4} className="px-4 py-2 text-xs text-azure/80 italic">
                        AI: {aiSug.reason}
                        {aiSug.sampleTransforms && aiSug.sampleTransforms.length > 0 && (
                          <span className="ml-2 text-neutral-500 not-italic">
                            (e.g. &ldquo;{aiSug.sampleTransforms[0].input}&rdquo; →{' '}
                            &ldquo;{aiSug.sampleTransforms[0].output}&rdquo;)
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
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
