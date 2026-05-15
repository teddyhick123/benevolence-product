// lib/import/ai/generate-report.ts
// AI-powered migration report generation

import { branding } from '@/lib/config';
import { callAI } from './client';

const REPORT_SYSTEM = `You are a professional consultant writing a migration summary report for a philanthropic organization.

The organization has just migrated their data from a legacy system (Blackbaud or similar) to ${branding.appName}, a modern philanthropic management platform.

Write a comprehensive yet readable report that:
1. Celebrates the successful migration
2. Provides clear data on what was migrated
3. Highlights any data quality improvements made
4. Lists any remaining action items clearly
5. Projects the efficiency gains the organization will experience

## Tone
- Professional and confident
- Warm and mission-aligned (remember this is a charitable organization)
- Factual — stick to the numbers provided
- Optimistic but honest about any remaining issues

## Format
Return valid Markdown. Use:
- # for main title
- ## for sections
- **bold** for key metrics
- > blockquote for executive summary
- Tables for data comparisons
- - bullet lists for action items

Include these sections in order:
1. Executive Summary (blockquote)
2. Migration Overview (stats table)
3. Data Quality Analysis
4. Financial Reconciliation
5. What's New in ${branding.appName} (3-4 bullet points about features they now have)
6. Action Items (if any)
7. Next Steps (go-live checklist)

Include chart placeholders: [CHART: Holdings by Asset Class] — the PDF renderer will replace these.`;

export interface EntityStats {
  loaded: number;
  failed: number;
  total: number;
}

export interface ReportParams {
  jobName: string;
  portfolioName: string;
  sourceSystem: string;
  completedAt: string;
  entityCounts: Record<string, EntityStats>;
  financialReconciliation: {
    sourceTotal: number;
    loadedTotal: number;
    deltaPercent: number;
  };
  errorsFixed: number;
  aiSuggestionsApplied: number;
  actionItems: string[];
  enrichmentStats: {
    charitiesMatched: number;
    taxYearsDerived: number;
    deductibleAmountsCalculated: number;
  };
}

export async function generateMigrationReport(params: ReportParams): Promise<string> {
  const {
    jobName,
    portfolioName,
    sourceSystem,
    completedAt,
    entityCounts,
    financialReconciliation,
    errorsFixed,
    aiSuggestionsApplied,
    actionItems,
    enrichmentStats,
  } = params;

  const totalRecords = Object.values(entityCounts).reduce((sum, e) => sum + e.total, 0);
  const totalLoaded = Object.values(entityCounts).reduce((sum, e) => sum + e.loaded, 0);
  const totalFailed = Object.values(entityCounts).reduce((sum, e) => sum + e.failed, 0);
  const successRate = totalRecords > 0 ? Math.round((totalLoaded / totalRecords) * 100) : 0;

  const entityTableRows = Object.entries(entityCounts)
    .map(([entity, stats]) => {
      const rate = stats.total > 0 ? Math.round((stats.loaded / stats.total) * 100) : 0;
      return `| ${entity} | ${stats.total.toLocaleString()} | ${stats.loaded.toLocaleString()} | ${stats.failed.toLocaleString()} | ${rate}% |`;
    })
    .join('\n');

  const userPrompt = `Generate a migration report for the following import:

**Job Name:** ${jobName}
**Portfolio / Organization:** ${portfolioName}
**Source System:** ${sourceSystem}
**Completed At:** ${completedAt}

## Record Counts
| Entity | Total | Loaded | Failed | Success Rate |
|--------|-------|--------|--------|--------------|
${entityTableRows}
| **TOTAL** | **${totalRecords.toLocaleString()}** | **${totalLoaded.toLocaleString()}** | **${totalFailed.toLocaleString()}** | **${successRate}%** |

## Financial Reconciliation
- Source System Total: $${financialReconciliation.sourceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Loaded to ${branding.appName}: $${financialReconciliation.loadedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Variance: ${financialReconciliation.deltaPercent.toFixed(2)}%

## AI-Assisted Improvements
- Errors automatically fixed: ${errorsFixed.toLocaleString()}
- AI suggestions applied: ${aiSuggestionsApplied.toLocaleString()}
- Charities matched via EIN lookup: ${enrichmentStats.charitiesMatched.toLocaleString()}
- Tax years auto-derived: ${enrichmentStats.taxYearsDerived.toLocaleString()}
- Deductible amounts calculated: ${enrichmentStats.deductibleAmountsCalculated.toLocaleString()}

## Remaining Action Items
${actionItems.length > 0 ? actionItems.map((item) => `- ${item}`).join('\n') : '- None — migration completed successfully!'}

Please write the full report now.`;

  const markdown = await callAI(REPORT_SYSTEM, userPrompt, {
    maxTokens: 2048,
    temperature: 0.3,
  });

  return markdown;
}
