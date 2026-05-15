import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { branding } from '@/lib/config';

/**
 * Calculates a 0–100 health score for a migration job.
 * Penalises financial delta up to 20 points.
 */
export function calculateHealthScore(
  entityCounts: Record<string, { total: number; loaded: number; failed: number }>,
  deltaPercent: number
): number {
  const totalSource = Object.values(entityCounts).reduce((s, e) => s + e.total, 0);
  const totalLoaded = Object.values(entityCounts).reduce((s, e) => s + e.loaded, 0);
  const successRate = totalSource > 0 ? (totalLoaded / totalSource) * 100 : 100;
  const financialPenalty = Math.min(deltaPercent * 5, 20);
  return Math.max(0, Math.min(100, Math.round(successRate - financialPenalty)));
}

export interface MigrationReportData {
  jobName: string;
  portfolioName: string;
  sourceSystem: string;
  completedAt: string;
  entityCounts: Record<string, { loaded: number; failed: number; total: number }>;
  financialReconciliation: {
    sourceTotal: number;
    loadedTotal: number;
    deltaPercent: number;
  };
  healthScore: number; // 0-100
  aiSuggestionsApplied: number;
  errorsFixed: number;
  actionItems: string[];
  enrichmentStats: {
    charitiesMatched: number;
    taxYearsDerived: number;
  };
  aiSummary?: string; // AI-generated executive summary (optional)
}

export function generateMigrationReportPDF(data: MigrationReportData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PRIMARY: [number, number, number] = [79, 70, 229];
  const GREEN: [number, number, number] = [16, 185, 129];
  const YELLOW: [number, number, number] = [245, 158, 11];
  const RED: [number, number, number] = [239, 68, 68];
  const GRAY: [number, number, number] = [107, 114, 128];
  const LIGHT_GRAY: [number, number, number] = [249, 250, 251];
  const BLACK: [number, number, number] = [17, 24, 39];
  const PAGE_WIDTH = 215.9;
  const MARGIN = 20;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let y = 0;

  // ── Cover Page ──
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_WIDTH, 120, 'F');

  // Logo/Brand area
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(branding.appName.toUpperCase(), MARGIN, 20);

  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text('Migration Report', MARGIN, 50);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(data.portfolioName, MARGIN, 64);

  doc.setFontSize(11);
  doc.text(`Migrated from: ${data.sourceSystem}`, MARGIN, 76);
  doc.text(`Completed: ${new Date(data.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, 84);

  // Health score badge on cover
  const scoreColor = data.healthScore >= 90 ? GREEN : data.healthScore >= 75 ? YELLOW : RED;
  doc.setFillColor(255, 255, 255);
  doc.circle(PAGE_WIDTH - MARGIN - 20, 70, 20, 'F');
  doc.setTextColor(...scoreColor);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.healthScore}`, PAGE_WIDTH - MARGIN - 20, 68, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('Health', PAGE_WIDTH - MARGIN - 20, 74, { align: 'center' });
  doc.text('Score', PAGE_WIDTH - MARGIN - 20, 79, { align: 'center' });

  y = 130;
  doc.setTextColor(...BLACK);

  // ── Executive Summary ──
  if (data.aiSummary) {
    doc.setFillColor(238, 242, 255); // indigo-50
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 40, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(67, 56, 202); // indigo-700
    const summaryLines = doc.splitTextToSize(data.aiSummary, CONTENT_WIDTH - 10);
    doc.text(summaryLines.slice(0, 5), MARGIN + 5, y + 9); // max 5 lines on cover
    y += 48;
  }

  // ── Stats Grid ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Migration Overview', MARGIN, y);
  y += 7;

  // Total records migrated
  const totalLoaded = Object.values(data.entityCounts).reduce((s, e) => s + e.loaded, 0);
  const totalSource = Object.values(data.entityCounts).reduce((s, e) => s + e.total, 0);
  const successRate = totalSource > 0 ? Math.round((totalLoaded / totalSource) * 100) : 0;

  const stats = [
    { label: 'Records Migrated', value: totalLoaded.toLocaleString() },
    { label: 'Success Rate', value: `${successRate}%` },
    { label: 'AI Fixes Applied', value: data.errorsFixed.toLocaleString() },
    { label: 'Charities Matched', value: data.enrichmentStats.charitiesMatched.toLocaleString() },
  ];

  const cardW = (CONTENT_WIDTH - 12) / 4;
  stats.forEach((stat, i) => {
    const x = MARGIN + i * (cardW + 4);
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(x, y, cardW, 22, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(stat.label, x + 4, y + 8);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(stat.value, x + 4, y + 18);
  });

  y += 30;

  // ── Entity Breakdown Table ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Data Breakdown', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Entity', 'Source Records', 'Migrated', 'Failed', 'Success Rate']],
    body: Object.entries(data.entityCounts).map(([entity, counts]) => {
      const rate = counts.total > 0 ? Math.round((counts.loaded / counts.total) * 100) : 0;
      return [
        entity.charAt(0).toUpperCase() + entity.slice(1),
        counts.total.toLocaleString(),
        counts.loaded.toLocaleString(),
        counts.failed.toLocaleString(),
        `${rate}%`,
      ];
    }),
    headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: BLACK },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Financial Reconciliation ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Financial Reconciliation', MARGIN, y);
  y += 6;

  const recon = data.financialReconciliation;
  const deltaOk = recon.deltaPercent < 1;

  doc.setFillColor(deltaOk ? 209 : 254, deltaOk ? 250 : 202, deltaOk ? 229 : 202); // green-100 or yellow-100
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 28, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(deltaOk ? 6 : 133, deltaOk ? 95 : 77, deltaOk ? 70 : 14);
  doc.text('Source Total', MARGIN + 8, y + 9);
  doc.text('Migrated Total', MARGIN + 70, y + 9);
  doc.text('Delta', MARGIN + 138, y + 9);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${recon.sourceTotal.toLocaleString()}`, MARGIN + 8, y + 21);
  doc.text(`$${recon.loadedTotal.toLocaleString()}`, MARGIN + 70, y + 21);
  doc.text(`${recon.deltaPercent.toFixed(2)}%`, MARGIN + 138, y + 21);

  y += 36;

  // ── Action Items (if any) ──
  if (data.actionItems.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Action Items', MARGIN, y);
    y += 6;

    data.actionItems.forEach((item, i) => {
      doc.setFillColor(254, 243, 199); // amber-100
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 10, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(146, 64, 14); // amber-800
      doc.text(`${i + 1}.  ${item}`, MARGIN + 4, y + 7);
      y += 13;
    });
    y += 4;
  }

  // ── Footer on all pages ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
      `${branding.appName} · ${data.portfolioName} · Page ${i} of ${pageCount}`,
      MARGIN,
      doc.internal.pageSize.height - 10
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}
