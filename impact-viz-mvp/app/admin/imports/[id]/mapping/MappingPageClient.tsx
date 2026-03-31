'use client';
// app/admin/imports/[id]/mapping/MappingPageClient.tsx
// Client component for the mapping review page

import { useState } from 'react';
import { MappingGrid, type TargetField } from '@/components/admin/MappingGrid';
import type { EntityMappingConfig, MappingProfile, ImportJob } from '@/lib/import/types';

interface StagingPreview {
  entity: string;
  sourceFields: string[];
  rowCount: number;
}

interface MappingPageClientProps {
  job: ImportJob;
  mappingProfile: MappingProfile;
  stagingPreviews: StagingPreview[];
}

const ENTITY_TARGET_FIELDS: Record<string, TargetField[]> = {
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
    { field: 'recipient_name', label: 'Recipient Name', required: true, entity: 'contributions', type: 'string' },
    { field: 'recipient_ein', label: 'Recipient EIN', required: false, entity: 'contributions', type: 'string' },
    { field: 'contribution_date', label: 'Gift Date', required: true, entity: 'contributions', type: 'date' },
    { field: 'amount_usd', label: 'Amount (USD)', required: true, entity: 'contributions', type: 'numeric' },
    { field: 'contribution_type', label: 'Gift Type', required: false, entity: 'contributions', type: 'enum' },
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

  const activePreview = stagingPreviews.find((p) => p.entity === activeEntity);
  const targetFields = ENTITY_TARGET_FIELDS[activeEntity] ?? [];
  const entityConfig: EntityMappingConfig = currentProfile.entity_mappings[activeEntity] ?? {
    field_map: {},
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
        source_system: currentProfile.source_system,
        description: currentProfile.description,
        entity_mappings: {
          ...currentProfile.entity_mappings,
          [activeEntity]: mapping,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error ?? 'Failed to save mapping');
    }

    const { profile } = await res.json();
    setCurrentProfile(profile);
  };

  const handleSaveAndValidate = async () => {
    setValidating(true);
    setValidateResult(null);
    try {
      // Save current mapping first
      await handleSaveMapping(entityConfig);

      // Trigger validation run
      const res = await fetch(`/api/admin/imports/${job.id}/run-validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityTypes: [activeEntity] }),
      });

      if (!res.ok) {
        const body = await res.json();
        setValidateResult(`Error: ${body.error ?? 'Validation failed'}`);
      } else {
        const body = await res.json();
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
          </button>
        ))}
      </div>

      {activePreview && activePreview.sourceFields.length > 0 ? (
        <MappingGrid
          entity={activeEntity}
          sourceFields={activePreview.sourceFields}
          targetFields={targetFields}
          existingMapping={entityConfig}
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
          className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
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
