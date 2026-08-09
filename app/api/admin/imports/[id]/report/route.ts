// app/api/admin/imports/[id]/report/route.ts
// GET /api/admin/imports/:id/report?format=markdown
// Generates the AI migration report and stores it in Supabase Storage

import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import type { SessionClient } from '@/lib/api/server-client';
import { generateMigrationReport } from '@/lib/import/ai/generate-report';
import type { ReportParams, EntityStats } from '@/lib/import/ai/generate-report';
import { calculateHealthScore } from '@/lib/pdf/migration-report-generator';
import { fromImportStagingRelation } from '@/lib/import/database';

type StagingRow = Record<string, unknown>;

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

async function countStagingRows(
  db: SessionClient,
  importJobId: string,
  table: string
): Promise<EntityStats> {
  const [total, loaded, failed] = await Promise.all([
    fromImportStagingRelation(db, table)
      .select('*', { count: 'exact', head: true })
      .eq('import_job_id', importJobId)
      .then(({ count }) => count ?? 0),
    fromImportStagingRelation(db, table)
      .select('*', { count: 'exact', head: true })
      .eq('import_job_id', importJobId)
      .in('action_taken', ['create', 'update'])
      .then(({ count }) => count ?? 0),
    fromImportStagingRelation(db, table)
      .select('*', { count: 'exact', head: true })
      .eq('import_job_id', importJobId)
      .eq('action_taken', 'error')
      .then(({ count }) => count ?? 0),
  ]);
  return { total, loaded, failed };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id: importJobId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'markdown';

  const { db } = access.context;

  // Fetch job
  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', importJobId)
    .single();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  const jobData = job as StagingRow;

  // Gather entity counts
  const stagingTables: Record<string, string> = {
    donors: 'staging_import_donors',
    holdings: 'staging_import_holdings',
    investees: 'staging_import_investees',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
  };

  const entityCountEntries = await Promise.all(
    Object.entries(stagingTables).map(async ([entity, table]) => {
      const counts = await countStagingRows(db, importJobId, table);
      return [entity, counts] as const;
    })
  );
  const entityCounts: Record<string, EntityStats> = Object.fromEntries(entityCountEntries);

  // Build financial reconciliation from reconciliation_data
  const recon = (jobData.reconciliation_data as Record<string, unknown> | null) ?? {};
  const reconEntities = (recon.entities as Record<string, unknown>[] | null) ?? [];
  let sourceTotal = 0;
  let loadedTotal = 0;

  const contribRecon = reconEntities.find(
    (e) => (e as Record<string, unknown>).entity === 'contributions'
  ) as Record<string, unknown> | undefined;

  if (contribRecon) {
    sourceTotal = (contribRecon.sourceAmountUSD as number) ?? 0;
    loadedTotal = (contribRecon.loadedAmountUSD as number) ?? 0;
  }

  const deltaPercent =
    sourceTotal > 0 ? Math.abs(((loadedTotal - sourceTotal) / sourceTotal) * 100) : 0;

  // Build action items from reconciliation
  const actionItems: string[] = [];
  const reconActionItems = (recon.action_items as string[] | null) ?? [];
  actionItems.push(...reconActionItems.slice(0, 5));

  // Add failed rows as action items
  const totalFailed = Object.values(entityCounts).reduce((sum, e) => sum + e.failed, 0);
  if (totalFailed > 0) {
    actionItems.push(`Review and resolve ${totalFailed} rows that failed to load`);
  }

  // Estimate enrichment stats from staged investees
  const { count: charitiesMatched } = await db
    .from('staging_import_investees')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', importJobId)
    .not('matched_charity_id', 'is', null);

  const reportParams: ReportParams = {
    scope: {
      kind: 'organization',
      orgId: String(jobData.org_id),
      actorId: access.context.user.id,
      portfolioId: (jobData.portfolio_id as string | null) ?? undefined,
    },
    jobName: (jobData.name as string) ?? 'Untitled Import',
    portfolioName: (jobData.portfolio_id as string) ?? 'Your Organization',
    sourceSystem: (jobData.source_type as string) ?? 'Legacy System',
    completedAt: (jobData.completed_at as string) ?? new Date().toISOString(),
    entityCounts,
    financialReconciliation: {
      sourceTotal,
      loadedTotal,
      deltaPercent,
    },
    errorsFixed: 0,
    aiSuggestionsApplied: 0,
    actionItems,
    enrichmentStats: {
      charitiesMatched: charitiesMatched ?? 0,
      taxYearsDerived: entityCounts.contributions?.loaded ?? 0,
      deductibleAmountsCalculated: entityCounts.contributions?.loaded ?? 0,
    },
  };

  // Generate report
  const markdown = await generateMigrationReport(reportParams);

  // Store in Supabase Storage
  let storageUrl: string | null = null;
  const reportPath = `${String(jobData.org_id)}/reports/${importJobId}/migration-report.md`;
  try {
    const { error: uploadError } = await db.storage
      .from('imports')
      .upload(
        reportPath,
        new Blob([markdown], { type: 'text/markdown' }),
        { upsert: true }
      );

    if (!uploadError) {
      const { data: urlData } = await db.storage
        .from('imports')
        .createSignedUrl(reportPath, 3600);
      storageUrl = urlData?.signedUrl ?? null;
    }
  } catch {
    // Storage upload is non-critical
  }

  if (format === 'pdf') {
    const { generateMigrationReportPDF } = await import('@/lib/pdf/migration-report-generator');

    // Fetch portfolio name
    const portfolioId = jobData.portfolio_id as string | null;
    const { data: portfolio } = portfolioId
      ? await db
          .from('portfolios')
          .select('name')
          .eq('id', portfolioId)
          .eq('org_id', String(jobData.org_id))
          .maybeSingle()
      : { data: null };

    const healthScore = calculateHealthScore(entityCounts, deltaPercent);

    const buffer = generateMigrationReportPDF({
      jobName: (jobData.name as string) ?? 'Untitled Import',
      portfolioName: portfolio?.name ?? 'Portfolio',
      sourceSystem: (jobData.source_type as string) ?? 'Legacy System',
      completedAt: (jobData.completed_at as string) ?? new Date().toISOString(),
      entityCounts,
      financialReconciliation: { sourceTotal, loadedTotal, deltaPercent },
      healthScore,
      aiSuggestionsApplied: (recon.ai_suggestions_applied as number) ?? 0,
      errorsFixed: (recon.errors_fixed as number) ?? 0,
      actionItems,
      enrichmentStats: {
        charitiesMatched: charitiesMatched ?? 0,
        taxYearsDerived: entityCounts.contributions?.loaded ?? 0,
      },
      aiSummary: (recon.ai_analysis as Record<string, unknown> | null)?.explanation as string | undefined,
    });

    return new Response(buffer, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="migration-report-${importJobId.slice(0, 8)}.pdf"`,
      },
    });
  }

  return jsonOk({ markdown, url: storageUrl });
}
