/**
 * IRS Form 8283 PDF Generator
 *
 * Generates IRS Form 8283 (Noncash Charitable Contributions) in PDF format.
 *
 * Form 8283 is required for:
 * - Section A: Noncash donations > $500 but ≤ $5,000
 * - Section B: Noncash donations > $5,000 (requires qualified appraisal)
 *
 * This module generates a structured PDF that matches IRS Form 8283 layout.
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export interface Form8283Contribution {
  // Donor information
  donor_name: string;
  donor_ssn?: string;
  donor_address?: string;

  // Contribution details
  contribution_date: string;
  property_description: string;
  recipient_name: string;
  recipient_ein?: string;
  recipient_address?: string;

  // Valuation
  fmv_at_donation: number;
  cost_basis?: number;
  date_acquired?: string;
  how_acquired?: string; // Purchase, Gift, Inheritance, etc.

  // Appraisal (Section B only)
  requires_appraisal?: boolean;
  appraisal_date?: string;
  appraisal_value?: number;
  appraiser_name?: string;
  appraiser_tin?: string;
  appraiser_address?: string;

  // Donation method
  donation_method?: string; // Donated directly, Transferred first, etc.
}

export interface Form8283Options {
  tax_year: number;
  contributions: Form8283Contribution[];
  donor_name: string;
  donor_ssn?: string;
}

/**
 * Generate IRS Form 8283 PDF
 */
export function generateForm8283PDF(options: Form8283Options): Uint8Array {
  const { tax_year, contributions, donor_name, donor_ssn } = options;

  // Separate contributions into Section A and Section B
  const sectionA = contributions.filter(c => c.fmv_at_donation <= 5000);
  const sectionB = contributions.filter(c => c.fmv_at_donation > 5000);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  let yPos = 20;

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Form 8283', 105, yPos, { align: 'center' });
  yPos += 6;

  doc.setFontSize(12);
  doc.text('Noncash Charitable Contributions', 105, yPos, { align: 'center' });
  yPos += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`(Rev. December ${tax_year})`, 105, yPos, { align: 'center' });
  yPos += 5;

  doc.text('Department of the Treasury - Internal Revenue Service', 105, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(9);
  doc.text(`▶ Attach to your tax return if you claimed a total deduction`, 105, yPos, { align: 'center' });
  yPos += 4;
  doc.text(`of over $500 for all contributed property.`, 105, yPos, { align: 'center' });
  yPos += 10;

  // Donor Information
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Name(s) shown on your income tax return:', 20, yPos);
  yPos += 5;

  doc.setFont('helvetica', 'normal');
  doc.text(donor_name, 25, yPos);
  yPos += 6;

  if (donor_ssn) {
    doc.setFont('helvetica', 'bold');
    doc.text('Identifying number:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(formatSSN(donor_ssn), 60, yPos);
    yPos += 10;
  } else {
    yPos += 8;
  }

  // Note about appraisals
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Note: Figure the amount of your contribution deduction before completing this form. See your tax return instructions.',
    20,
    yPos,
    { maxWidth: 170 }
  );
  yPos += 10;

  // Section A
  if (sectionA.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Section A. Donated Property of $5,000 or Less and Publicly Traded Securities', 20, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'List in this section only items (or groups of similar items) for which you claimed a deduction of $5,000 or less.',
      20,
      yPos,
      { maxWidth: 170 }
    );
    yPos += 10;

    // Section A Table
    const sectionAData = sectionA.map(c => [
      c.property_description,
      formatDate(c.contribution_date),
      formatCurrency(c.fmv_at_donation),
      c.cost_basis ? formatCurrency(c.cost_basis) : 'N/A',
      c.recipient_name,
    ]);

    (doc as any).autoTable({
      startY: yPos,
      head: [['Description', 'Date Donated', 'Fair Market Value', 'Cost Basis', 'Donee Name']],
      body: sectionAData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 45 },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section B
  if (sectionB.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Section B. Donated Property Over $5,000 (Except Certain Publicly Traded Securities)', 20, yPos);
    yPos += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      'Complete this section for items (or groups of similar items) for which you claimed a deduction of more than $5,000.',
      20,
      yPos,
      { maxWidth: 170 }
    );
    yPos += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('A qualified appraisal is generally required for property in this section.', 20, yPos);
    yPos += 10;

    // Section B Details (one per contribution)
    for (const contrib of sectionB) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);

      // Property Information
      doc.setFont('helvetica', 'bold');
      doc.text('Property Description:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(contrib.property_description, 70, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Donee Name:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(contrib.recipient_name, 70, yPos);
      yPos += 5;

      if (contrib.recipient_ein) {
        doc.setFont('helvetica', 'bold');
        doc.text('Donee EIN:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(contrib.recipient_ein, 70, yPos);
        yPos += 5;
      }

      if (contrib.recipient_address) {
        doc.setFont('helvetica', 'bold');
        doc.text('Donee Address:', 20, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(contrib.recipient_address, 70, yPos, { maxWidth: 120 });
        yPos += 5;
      }

      yPos += 2;

      // Valuation Information
      doc.setFont('helvetica', 'bold');
      doc.text('Date Contributed:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(formatDate(contrib.contribution_date), 70, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Date Acquired:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(contrib.date_acquired ? formatDate(contrib.date_acquired) : 'Unknown', 70, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('How Acquired:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(contrib.how_acquired || 'Purchase', 70, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Donor\'s Cost Basis:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(contrib.cost_basis ? formatCurrency(contrib.cost_basis) : 'N/A', 70, yPos);
      yPos += 5;

      doc.setFont('helvetica', 'bold');
      doc.text('Fair Market Value:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(formatCurrency(contrib.fmv_at_donation), 70, yPos);
      yPos += 5;

      // Appraisal Information
      if (contrib.requires_appraisal) {
        yPos += 3;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Appraisal Information:', 20, yPos);
        yPos += 5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        if (contrib.appraisal_date) {
          doc.text(`Date of Appraisal: ${formatDate(contrib.appraisal_date)}`, 25, yPos);
          yPos += 4;
        }

        if (contrib.appraisal_value) {
          doc.text(`Appraised Value: ${formatCurrency(contrib.appraisal_value)}`, 25, yPos);
          yPos += 4;
        }

        if (contrib.appraiser_name) {
          doc.text(`Appraiser Name: ${contrib.appraiser_name}`, 25, yPos);
          yPos += 4;
        }

        if (contrib.appraiser_tin) {
          doc.text(`Appraiser TIN: ${contrib.appraiser_tin}`, 25, yPos);
          yPos += 4;
        }
      }

      yPos += 5;
      doc.line(20, yPos, 190, yPos); // Separator
      yPos += 8;
    }
  }

  // Footer/Disclaimer
  if (yPos > 260) {
    doc.addPage();
    yPos = 20;
  }

  yPos += 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'IMPORTANT: This is a generated summary. You must attach the official IRS Form 8283 to your tax return. ' +
    'Section B contributions require a qualified appraisal and appraiser declaration. Consult a tax professional.',
    20,
    yPos,
    { maxWidth: 170, align: 'left' }
  );

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

/**
 * Helper: Format currency
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Helper: Format date
 */
function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Helper: Format SSN (with masking)
 */
function formatSSN(ssn: string): string {
  // Mask all but last 4 digits: XXX-XX-1234
  if (ssn.length >= 4) {
    const last4 = ssn.slice(-4);
    return `XXX-XX-${last4}`;
  }
  return 'XXX-XX-XXXX';
}
