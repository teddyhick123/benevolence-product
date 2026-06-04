'use client';
// app/admin/imports/[id]/mapping/MappingPageClient.tsx
// Client component for the mapping review page

import { useState, useEffect } from 'react';
import { MappingGrid, type TargetField } from '@/components/admin/MappingGrid';
import type { EntityMappingConfig, MappingProfile, ImportJob } from '@/lib/import/types';
import type { MappingAssistResult } from '@/lib/import/ai/mapping-assist';

interface StagingPreview {
  entity: string;
  sourceFields: string[];
  sampleRecords: Record<string, unknown>[];
  rowCount: number;
}

interface MappingPageClientProps {
  job: ImportJob;
  mappingProfile: MappingProfile;
  stagingPreviews: StagingPreview[];
}

const ENTITY_TARGET_FIELDS: Record<string, TargetField[]> = {
  donors: [
    { field: 'display_name', label: 'Display Name', required: true, entity: 'donors', type: 'string' },
    { field: 'first_name', label: 'First Name', required: false, entity: 'donors', type: 'string' },
    { field: 'last_name', label: 'Last Name', required: false, entity: 'donors', type: 'string' },
    { field: 'organization_name', label: 'Organization Name', required: false, entity: 'donors', type: 'string' },
    { field: 'email', label: 'Email', required: false, entity: 'donors', type: 'string' },
    { field: 'external_id', label: 'Source ID', required: false, entity: 'donors', type: 'string' },
  ],
  holdings: [
    { field: 'name', label: 'Fund Name', required: true, entity: 'holdings', type: 'string' },
    { field: 'custodian', label: 'Custodian', required: false, entity: 'holdings', type: 'string' },
    { field: 'funds_allocated', label: 'Market Value', required: false, entity: 'holdings', type: 'numeric' },
    { field: 'as_of', label: 'As Of Date', required: false, entity: 'holdings', type: 'date' },
    { field: 'asset_type', label: 'Asset Type', required: false, entity: 'holdings', type: 'enum' },
  ],
  investees: [
    { field: 'display_name', label: 'Name', required: true, entity: 'investees', type: 'string' },
    { field: 'ein', label: 'EIN', required: false, entity: 'investees', type: 'string' },
    { field: 'sector', label: 'Sector', required: false, entity: 'investees', type: 'string' },
    { field: 'country', label: 'Country', required: false, entity: 'investees', type: 'string' },
    { field: 'city', label: 'City', required: false, entity: 'investees', type: 'string' },
  ],
  contributions: [
    { field: 'donor_name', label: 'Donor Name', required: true, entity: 'contributions', type: 'string' },
    { field: 'donor_email', label: 'Donor Email', required: false, entity: 'contributions', type: 'string' },
    { field: 'donor_external_id', label: 'Donor Source ID', required: false, entity: 'contributions', type: 'string' },
    { field: 'contribution_date', label: 'Gift Date', required: true, entity: 'contributions', type: 'date' },
    { field: 'amount_usd', label: 'Amount (USD)', required: true, entity: 'contributions', type: 'numeric' },
    { field: 'gift_type', label: 'Gift Type', required: false, entity: 'contributions', type: 'enum' },
  ],
  metrics: [
    { field: 'metric_code', label: 'Field Name / Code', required: true, entity: 'metrics', type: 'string' },
    { field: 'value', label: 'Field Value', required: false, entity: 'metrics', type: 'numeric' },
    { field: 'period_start', label: 'Date / Period', required: false, entity: 'metrics', type: 'date' },
  ],
};

export function MappingPageClient({ job, mappingProfile, stagingPreviews }: MappingPageClientProps) {
  const entityTypes = stagingPreviews.map((p) => p.entity);
  const [activeEntity, setActiveEntity] = useState(entityTypes[0] ?? 'holdings');
  const [currentProfile, setCurrentProfile] = useState<MappingProfile>(mappingProfile);
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<string | null>(null);

  // AI state per entity
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, MappingAssistResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiToast, setAiToast] = useState<string | null>(null);

  const activePreview = stagingPreviews.find((p) => p.entity === activeEntity);
  const targetFields = ENTITY_TARGET_FIELDS[activeEntity] ?? [];
  const entityConfig: EntityMappingConfig = currentProfile.entity_mappings[activeEntity] ?? {
    field_map: {},
  };

  // Auto-run AI analysis on page load for entities with source fields
  useEffect(() => {
    for (const preview of stagingPreviews) {
      if (preview.sourceFields.length > 0 && !aiSuggestions[preview.entity]) {
        fetchAISuggestions(preview.entity);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAISuggestions = async (entityType: string) => {
    const preview = stagingPreviews.find((p) => p.entity === entityType);
    if (!preview || preview.sourceFields.length === 0) return;

    setAiLoading((prev) => ({ ...prev, [entityType]: true }));
    try {
      const res = await fetch('/api/admin/imports/mapping-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: job.source_type,
          entity_type: entityType,
          source_fields: preview.sourceFields,
          sample_records: preview.sampleRecords,
          existing_mapping: currentProfile.entity_mappings[entityType] ?? undefined,
        }),
      });

      if (res.ok) {
        const body = await res.json() as { data: MappingAssistResult };
        setAiSuggestions((prev) => ({ ...prev, [entityType]: body.data }));
        const high = body.data.mappings.filter((m) => m.confidence >= 0.85).length;
        setAiToast(`AI mapped ${high}/${body.data.mappings.length} fields automatically`);
        setTimeout(() => setAiToast(null), 4000);
      }
    } catch {
      // non-blocking — AI is best-effort
    } finally {
      setAiLoading((prev) => ({ ...prev, [entityType]: false }));
    }
  };

  const handleMappingChange = (mapping: EntityMappingConfig) => {
    setCurrentProfile((prev) => ({
      ...prev,
      entity_mappings: {
        ...prev.entity_mappings,
        [activeEntity]: mapping,
      },
    }));
  };

  const handleSaveMapping = async (mapping: EntityMappingConfig) => {
    const res = await fetch('/api/admin/import/mapping-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: currentProfile.id,
        name: currentProfile.name,
        source_type: currentProfile.source_type,
        description: currentProfile.description,
        entity_mappings: {
          ...currentProfile.entity_mappings,
          [activeEntity]: mapping,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? 'Failed to save mapping');
    }

    const { profile } = await res.json() as { profile: MappingProfile };
    setCurrentProfile(profile);
  };

  const handleSaveAndValidate = async () => {
    setValidating(true);
    setValidateResult(null);
    try {
      await handleSaveMapping(entityConfig);

      const res = await fetch(`/api/admin/imports/${job.id}/run-validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityTypes: [activeEntity] }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        setValidateResult(`Error: ${body.error ?? 'Validation failed'}`);
      } else {
        const body = await res.json() as { valid?: number; invalid?: number; warnings?: number };
        setValidateResult(
          `Validation complete: ${body.valid ?? 0} valid, ${body.invalid ?? 0} invalid, ${body.warnings ?? 0} warnings`
        );
      }
    } catch (err) {
      setValidateResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI toast */}
      {aiToast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-azure text-white text-sm rounded-2xl shadow-lg transition-opacity">
          {aiToast}
        </div>
      )}

      {/* Entity tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        {entityTypes.map((et) => (
          <button
            key={et}
            onClick={() => setActiveEntity(et)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              activeEntity === et
                ? 'border-azure text-azure'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {et}
            {stagingPreviews.find((p) => p.entity === et)?.rowCount
              ? ` (${stagingPreviews.find((p) => p.entity === et)!.rowCount.toLocaleString()})`
              : ''}
            {aiLoading[et] && (
              <span className="ml-1 text-xs animate-spin">⟳</span>
            )}
          </button>
        ))}
      </div>

      {activePreview && activePreview.sourceFields.length > 0 ? (
        <MappingGrid
          entity={activeEntity}
          sourceFields={activePreview.sourceFields}
          targetFields={targetFields}
          existingMapping={entityConfig}
          aiSuggestions={aiSuggestions[activeEntity]}
          onRequestAISuggestions={() => fetchAISuggestions(activeEntity)}
          isLoadingAI={aiLoading[activeEntity] ?? false}
          onChange={handleMappingChange}
          onSave={handleSaveMapping}
        />
      ) : (
        <div className="card p-6 text-sm text-neutral-500">
          No CSV data extracted yet for {activeEntity}. Upload a file to see source fields.
        </div>
      )}

      {/* Save & Validate */}
      <div className="flex items-center gap-3 pt-2 border-t border-neutral-100">
        <button
          onClick={handleSaveAndValidate}
          disabled={validating}
          className="px-4 py-2 text-sm rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {validating ? 'Validating…' : 'Save & Validate'}
        </button>
        {validateResult && (
          <p
            className={`text-sm ${
              validateResult.startsWith('Error:') ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {validateResult}
          </p>
        )}
      </div>
    </div>
  );
}
