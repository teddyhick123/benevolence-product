// lib/import/ai/mapping-assist.ts
// Orchestrates AI-powered field mapping suggestions

import { callAI } from './client';
import { MAPPING_ASSIST_SYSTEM, buildMappingAssistPrompt } from './prompts/mapping-assist';

export interface MappingSuggestion {
  targetField: string;
  sourceField: string;
  confidence: number;
  reason: string;
  transform?: string;
  sampleTransforms?: Array<{ input: string; output: string }>;
}

export interface MappingAssistResult {
  entity: string;
  sourceEntity: string;
  confidenceOverall: number;
  mappings: MappingSuggestion[];
  unmappedSourceFields: string[];
  missingRequiredTargets: string[];
  notes?: string;
}

export async function suggestMappings(params: {
  sourceSystem: string;
  entityType: string;
  sourceFields: string[];
  sampleRecords: Record<string, string>[];
  existingMapping?: Record<string, unknown>;
}): Promise<MappingAssistResult> {
  const userPrompt = buildMappingAssistPrompt(params);
  const raw = await callAI(MAPPING_ASSIST_SYSTEM, userPrompt, { maxTokens: 2048 });

  // Parse JSON response, with error handling
  try {
    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      entity: parsed.entity,
      sourceEntity: parsed.source_entity,
      confidenceOverall: parsed.confidence_overall,
      mappings: (parsed.mappings as Record<string, unknown>[]).map((m) => ({
        targetField: m.target_field as string,
        sourceField: m.source_field as string,
        confidence: m.confidence as number,
        reason: m.reason as string,
        transform: (m.transform as string | null) ?? undefined,
        sampleTransforms: (m.sample_transforms as Array<{ input: string; output: string }>) ?? undefined,
      })),
      unmappedSourceFields: (parsed.unmapped_source_fields as string[]) ?? [],
      missingRequiredTargets: (parsed.missing_required_targets as string[]) ?? [],
      notes: (parsed.notes as string) ?? undefined,
    };
  } catch (err) {
    throw new Error(`Failed to parse AI mapping response: ${err}. Raw: ${raw.slice(0, 200)}`);
  }
}
