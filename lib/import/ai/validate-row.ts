// lib/import/ai/validate-row.ts
// AI-powered fix suggestions for individual rows with validation errors

import { callAI } from './client';
import type { AIExecutionScope } from '@/lib/ai/execution';

const VALIDATE_ROW_SYSTEM = `You are a data quality specialist for philanthropic software. Analyze a single row that failed validation and suggest intelligent fixes.

Common issues in Blackbaud/nonprofit CRM exports:
- EINs stored as integers, losing leading zeros (123456789 should be 01-2345678)
- Dates in MM/DD/YYYY or YYYYMMDD format instead of YYYY-MM-DD
- ZIP codes truncated (12345 instead of 12345-6789)
- Gift types using non-standard labels (PayPal → cash, Venmo → cash, DAF → other_property)
- Amounts with currency symbols ($1,000.00 → 1000.00)
- Boolean fields as Yes/No strings
- NULL stored as the string 'NULL' or 'N/A'

For each validation error, suggest:
1. auto_fix: corrected value (if you can determine it with >80% confidence)
2. warning: flag for review without blocking
3. skip: row should be skipped with reason
4. manual: requires human judgment

Respond ONLY with valid JSON array. No markdown.

[
  {
    "field": "recipient_ein",
    "suggestion_type": "fix_field",
    "confidence": 0.87,
    "explanation": "EIN stored as integer, losing leading zero. Standard Blackbaud export issue.",
    "proposed_value": "01-2345678",
    "auto_fixable": true,
    "bulk_applicable": true,
    "bulk_condition": "LENGTH(REGEXP_REPLACE(value, '[^0-9]', '', 'g')) = 9"
  }
]`;

export interface AISuggestion {
  field: string;
  suggestion_type: 'fix_field' | 'warning' | 'skip' | 'manual';
  confidence: number;
  explanation: string;
  proposed_value?: unknown;
  auto_fixable: boolean;
  bulk_applicable?: boolean;
  bulk_condition?: string;
}

export async function suggestRowFixes(params: {
  scope: AIExecutionScope;
  entityType: string;
  rawData: Record<string, string>;
  transformedData: Record<string, unknown> | null;
  validationErrors: Array<{ field: string; message: string; severity: string; rule: string }>;
}): Promise<AISuggestion[]> {
  const userPrompt = `## Entity Type: ${params.entityType}

## Raw Data:
${JSON.stringify(params.rawData, null, 2)}

## Transformed Data:
${JSON.stringify(params.transformedData ?? {}, null, 2)}

## Validation Errors:
${JSON.stringify(params.validationErrors, null, 2)}

Suggest fixes for each validation error above.`;

  const raw = await callAI(VALIDATE_ROW_SYSTEM, userPrompt, {
    scope: params.scope,
    maxTokens: 1024,
  });

  try {
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned) as AISuggestion[];
  } catch (err) {
    throw new Error(`Failed to parse AI row fix response: ${err}. Raw: ${raw.slice(0, 200)}`);
  }
}
