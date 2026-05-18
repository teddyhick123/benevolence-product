import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface TaxReportData {
  portfolioName: string;
  taxYear: number;
  generatedAt: string;
  summary: {
    totalContributions: number;
    totalDeductible: number;
    cashContributions: number;
    nonCashContributions: number;
    contributionCount: number;
    complianceRate: number | null;
    totalCarryforwardAvailable: number;
  };
  profile: {
    filingStatus: string;
    estimatedAGI: number | null;
  } | null;
  contributions: Array<{
    date: string;
    recipient: string;
    recipientEIN: string;
    recipientType?: string;
    type: string;
    amount: number;
    deductibleAmount: number;
    fmv?: number | null;
    costBasis?: number | null;
    propertyDescription?: string;
    qcdQualified?: string;
    substantiationStatus?: string;
    acknowledgmentReceived: string;
    appraisalPresent?: string;
    isCompliant: string;
    substantiationRequired?: string;
  }>;
  carryforwards: Array<{
    originatingYear: number;
    expiresYear: number;
    category: string;
    originalAmount: number;
    remainingAmount: number;
  }>;
}

export function generateTaxReportPDF(data: TaxReportData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PRIMARY_COLOR: [number, number, number] = [79, 70, 229]; // indigo-600
  const GRAY: [number, number, number] = [107, 114, 128];
  const LIGHT_GRAY: [number, number, number] = [249, 250, 251];
  const BLACK: [number, number, number] = [17, 24, 39];
  const PAGE_WIDTH = 215.9;
  const MARGIN = 20;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  let y = MARGIN;

  // ── Header ──
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, PAGE_WIDTH, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Tax Summary Report', MARGIN, 18);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.portfolioName}  ·  Tax Year ${data.taxYear}`, MARGIN, 28);
  doc.text(`Generated ${new Date(data.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, MARGIN, 35);

  y = 52;

  // ── Summary Cards (2x2 grid) ──
  doc.setTextColor(...BLACK);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', MARGIN, y);
  y += 6;

  const cardW = (CONTENT_WIDTH - 8) / 2;
  const cardH = 22;
  const cards = [
    { label: 'Total Contributions', value: `$${data.summary.totalContributions.toLocaleString()}` },
    { label: 'Total Deductible', value: `$${data.summary.totalDeductible.toLocaleString()}` },
    { label: 'Number of Gifts', value: `${data.summary.contributionCount}` },
    { label: 'Compliance Rate', value: data.summary.complianceRate != null ? `${data.summary.complianceRate}%` : 'N/A' },
  ];

  cards.forEach((card, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * (cardW + 8);
    const cardY = y + row * (cardH + 4);

    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(x, cardY, cardW, cardH, 3, 3, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(card.label, x + 5, cardY + 8);

    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(card.value, x + 5, cardY + 17);
  });

  y += 2 * (cardH + 4) + 10;

  // ── Carryforward banner (if applicable) ──
  if (data.summary.totalCarryforwardAvailable > 0) {
    doc.setFillColor(254, 249, 195); // yellow-100
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 12, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(133, 77, 14); // yellow-800
    doc.text(`Carryforward available: $${data.summary.totalCarryforwardAvailable.toLocaleString()} — may be applied to future tax years`, MARGIN + 4, y + 8);
    y += 18;
  }

  // ── Contributions Table ──
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('Contributions', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'Recipient', 'Type', 'Amount', 'Deductible', 'Compliant']],
    body: data.contributions.map(c => [
      c.date,
      c.recipient.length > 28 ? c.recipient.slice(0, 26) + '…' : c.recipient,
      c.type,
      `$${Number(c.amount).toLocaleString()}`,
      `$${Number(c.deductibleAmount).toLocaleString()}`,
      c.isCompliant,
    ]),
    headStyles: {
      fillColor: PRIMARY_COLOR,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 8, textColor: BLACK },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 60 },
      2: { cellWidth: 28 },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 16, halign: 'center' },
    },
    didDrawPage: (hookData) => {
      // Footer on each page
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text(
        `${data.portfolioName} · Tax Year ${data.taxYear} · Page ${hookData.pageNumber} of ${pageCount}`,
        MARGIN,
        doc.internal.pageSize.height - 10
      );
    },
  });

  // ── Carryforwards Table (if any) ──
  if (data.carryforwards.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text('Carryforward Schedule', MARGIN, finalY);

    autoTable(doc, {
      startY: finalY + 4,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Originating Year', 'Expires', 'Category', 'Original Amount', 'Remaining']],
      body: data.carryforwards.map(cf => [
        cf.originatingYear,
        cf.expiresYear,
        cf.category,
        `$${Number(cf.originalAmount).toLocaleString()}`,
        `$${Number(cf.remainingAmount).toLocaleString()}`,
      ]),
      headStyles: { fillColor: PRIMARY_COLOR, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: BLACK },
      alternateRowStyles: { fillColor: LIGHT_GRAY },
    });
  }

  // ── Disclaimer (last page) ──
  doc.addPage();
  doc.setFillColor(...PRIMARY_COLOR);
  doc.rect(0, 0, PAGE_WIDTH, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Important Disclaimer', MARGIN, 10);

  doc.setTextColor(...BLACK);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const disclaimer = 'This report is generated for informational purposes only and does not constitute tax advice. Please consult a qualified tax professional before making any tax-related decisions. The information contained herein is based on data provided and may not reflect all applicable tax laws and regulations.';
  const lines = doc.splitTextToSize(disclaimer, CONTENT_WIDTH);
  doc.text(lines, MARGIN, 30);

  return Buffer.from(doc.output('arraybuffer'));
}
