// lib/import/ai/reconcile.ts
// AI-powered reconciliation analysis — explains discrepancies and suggests fixes

import { callAI } from './client';
import type { ReconciliationReport } from '../reconciler';
import type { AIExecutionScope } from '@/lib/ai/execution';

const RECONCILE_SYSTEM = `You are a data integrity analyst specializing in philanthropic software migrations.

Your task: analyze discrepancies between source (staging) and target (production) data after a migration, and explain them clearly in plain English.

Rules:
- Be specific about root causes, not vague
- Distinguish between acceptable rounding differences vs real data loss
- Suggest concrete fixes when possible
- Tone: professional, reassuring, educational

Output ONLY valid JSON:
{
  "explanation": "Plain English explanation of all discrepancies",
  "root_causes": ["Cause 1", "Cause 2"],
  "is_acceptable": true,
  "confidence": 0.0,
  "suggested_fixes": [
    {
      "description": "What to do",
      "severity": "critical",
      "auto_fixable": true
    }
  ],
  "statistics": {
    "rows_with_rounding": 0,
    "max_individual_delta": 0.00,
    "likely_cause": "rounding"
  }
}`;

export interface ReconciliationAnalysis {
  explanation: string;
  rootCauses: string[];
  isAcceptable: boolean;
  confidence: number;
  suggestedFixes: Array<{
    description: string;
    severity: 'critical' | 'warning' | 'info';
    autoFixable: boolean;
  }>;
  statistics: {
    rowsWithRounding: number;
    maxIndividualDelta: number;
    likelyCause: string;
  };
}

interface RawAnalysis {
  explanation?: string;
  root_causes?: string[];
  is_acceptable?: boolean;
  confidence?: number;
  suggested_fixes?: Array<{
    description?: string;
    severity?: string;
    auto_fixable?: boolean;
  }>;
  statistics?: {
    rows_with_rounding?: number;
    max_individual_delta?: number;
    likely_cause?: string;
  };
}

export async function analyzeReconciliation(
  report: ReconciliationReport,
  sampleMismatches: Array<{ staging: Record<string, unknown>; production: Record<string, unknown> }> | undefined,
  scope: AIExecutionScope,
): Promise<ReconciliationAnalysis> {
  const userPrompt = JSON.stringify(
    {
      reconciliation_report: report,
      sample_mismatches: (sampleMismatches ?? []).slice(0, 5),
    },
    null,
    2
  );

  const raw = await callAI(RECONCILE_SYSTEM, userPrompt, {
    scope,
    maxTokens: 2048,
    temperature: 0.1,
  });

  let parsed: RawAnalysis;
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    parsed = JSON.parse(cleaned) as RawAnalysis;
  } catch {
    // Return a safe fallback if AI response is malformed
    return {
      explanation: raw.slice(0, 500),
      rootCauses: ['Unable to parse AI response'],
      isAcceptable: false,
      confidence: 0,
      suggestedFixes: [],
      statistics: { rowsWithRounding: 0, maxIndividualDelta: 0, likelyCause: 'unknown' },
    };
  }

  return {
    explanation: parsed.explanation ?? '',
    rootCauses: parsed.root_causes ?? [],
    isAcceptable: parsed.is_acceptable ?? false,
    confidence: parsed.confidence ?? 0,
    suggestedFixes: (parsed.suggested_fixes ?? []).map((f) => ({
      description: f.description ?? '',
      severity: (['critical', 'warning', 'info'].includes(f.severity ?? '') ? f.severity : 'info') as 'critical' | 'warning' | 'info',
      autoFixable: f.auto_fixable ?? false,
    })),
    statistics: {
      rowsWithRounding: parsed.statistics?.rows_with_rounding ?? 0,
      maxIndividualDelta: parsed.statistics?.max_individual_delta ?? 0,
      likelyCause: parsed.statistics?.likely_cause ?? 'unknown',
    },
  };
}
