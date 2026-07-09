import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { branding } from '@/lib/config';

export interface BoardReportData {
  portfolioName: string;
  title?: string;
  reportDate: string;
  asOfDate: string;
  sections?: string[];
  // Holdings summary
  totalPortfolioValue: number;
  holdingsCount: number;
  holdingsByAssetClass: Array<{ assetClass: string; value: number; percent: number }>;
  holdingsBySector: Array<{ sector: string; value: number; count: number }>;
  // Contributions summary
  taxYear: number;
  totalContributions: number;
  contributionCount: number;
  // Impact
  topHoldings: Array<{ name: string; value: number; sector: string; assetClass: string }>;
  // KPIs
  kpis: Array<{ name: string; value: string; unit: string; trend?: 'up' | 'down' | 'flat' }>;
}

export function generateBoardReportPDF(data: BoardReportData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PRIMARY: [number, number, number] = [79, 70, 229];
  const GRAY: [number, number, number] = [107, 114, 128];
  const LIGHT_GRAY: [number, number, number] = [249, 250, 251];
  const BLACK: [number, number, number] = [17, 24, 39];
  const PAGE_WIDTH = 215.9;
  const MARGIN = 20;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const sections = data.sections?.length
    ? data.sections
    : ['overview', 'financials', 'holdings', 'impact'];
  const hasSection = (section: string) => sections.includes(section);

  // ── Cover Page ──
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_WIDTH, 140, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(branding.appName.toUpperCase(), MARGIN, 20);

  doc.setFontSize(30);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title ?? 'Portfolio Report', MARGIN, 55);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.text(data.portfolioName, MARGIN, 70);

  doc.setFontSize(11);
  doc.text(`As of: ${new Date(data.asOfDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, 84);
  doc.text(`Prepared: ${new Date(data.reportDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, 92);

  if (hasSection('financials')) {
    doc.setFillColor(255, 255, 255, 0.15);
    doc.roundedRect(MARGIN, 105, CONTENT_WIDTH, 25, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 255);
    doc.text('Total Portfolio Value', MARGIN + 8, 114);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`$${data.totalPortfolioValue.toLocaleString()}`, MARGIN + 8, 126);
  }

  let y = 155;
  doc.setTextColor(...BLACK);

  if (hasSection('overview')) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Portfolio Overview', MARGIN, y);
    y += 6;

    const cardW = (CONTENT_WIDTH - 8) / 3;
    const overviewCards = [
      { label: 'Total Holdings', value: data.holdingsCount.toString() },
      { label: 'Total Contributions', value: `$${data.totalContributions.toLocaleString()}` },
      { label: 'Contribution Count', value: data.contributionCount.toString() },
    ];

    overviewCards.forEach((card, i) => {
      const x = MARGIN + i * (cardW + 4);
      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(x, y, cardW, 22, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(card.label, x + 5, y + 8);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(card.value, x + 5, y + 18);
    });

    y += 30;
  }

  // ── Asset Class Breakdown ──
  if (hasSection('holdings') && data.holdingsByAssetClass.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Holdings by Asset Class', MARGIN, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Asset Class', 'Value', 'Allocation']],
      body: data.holdingsByAssetClass.map(h => [
        h.assetClass,
        `$${h.value.toLocaleString()}`,
        `${h.percent.toFixed(1)}%`,
      ]),
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Sector Breakdown ──
  if (hasSection('holdings') && data.holdingsBySector.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Holdings by Sector', MARGIN, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Sector', 'Value', 'Holdings']],
      body: data.holdingsBySector.map(s => [
        s.sector,
        `$${s.value.toLocaleString()}`,
        s.count.toString(),
      ]),
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Top Holdings ──
  if (hasSection('holdings') && data.topHoldings.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Top Holdings', MARGIN, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Name', 'Asset Class', 'Sector', 'Value']],
      body: data.topHoldings.slice(0, 10).map(h => [
        h.name.length > 35 ? h.name.slice(0, 33) + '…' : h.name,
        h.assetClass,
        h.sector,
        `$${h.value.toLocaleString()}`,
      ]),
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: BLACK },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
      columnStyles: {
        3: { halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── KPIs ──
  if (hasSection('impact') && data.kpis.length > 0) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Key Performance Indicators', MARGIN, y);
    y += 6;

    const kpiCardW = (CONTENT_WIDTH - 12) / 4;
    const kpisPerRow = 4;

    data.kpis.forEach((kpi, i) => {
      const col = i % kpisPerRow;
      const row = Math.floor(i / kpisPerRow);
      const x = MARGIN + col * (kpiCardW + 4);
      const cardY = y + row * 26;

      const trendSymbol = kpi.trend === 'up' ? '▲' : kpi.trend === 'down' ? '▼' : '─';
      const trendColor: [number, number, number] = kpi.trend === 'up' ? [16, 185, 129] : kpi.trend === 'down' ? [239, 68, 68] : GRAY;

      doc.setFillColor(...LIGHT_GRAY);
      doc.roundedRect(x, cardY, kpiCardW, 22, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRAY);
      doc.text(kpi.name, x + 4, cardY + 7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(`${kpi.value}${kpi.unit ? ' ' + kpi.unit : ''}`, x + 4, cardY + 16);
      if (kpi.trend) {
        doc.setFontSize(8);
        doc.setTextColor(...trendColor);
        doc.text(trendSymbol, x + kpiCardW - 8, cardY + 16);
      }
    });

    const kpiRows = Math.ceil(data.kpis.length / kpisPerRow);
    y += kpiRows * 26 + 6;
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
