import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { branding } from '@/lib/config';
import jsPDF from 'jspdf';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; id: string }>;
}

// POST /api/org/[orgId]/acknowledgments/[id]/generate-pdf
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, id } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch letter with donor
    const { data: letter, error: letterErr } = await supabase
      .from('acknowledgment_letters')
      .select(`
        *,
        donors(first_name, last_name, organization_name, is_organization, address_line1, address_line2, city, state, zip, country)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (letterErr || !letter) {
      return NextResponse.json({ error: 'Letter not found' }, { status: 404 });
    }

    const pdfBuffer = generateAcknowledgmentPDF(letter);

    // Upload to Supabase Storage using admin client (bypasses RLS on storage)
    const admin = createAdminClient();
    const storagePath = `acknowledgments/${orgId}/${id}.pdf`;

    const { error: uploadErr } = await admin.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    // Store the path; generate a short-lived signed URL (never store public URLs for donor PII)
    await supabase
      .from('acknowledgment_letters')
      .update({ storage_path: storagePath, storage_bucket: 'documents' })
      .eq('id', id)
      .eq('org_id', orgId);

    const { data: signedData, error: signErr } = await admin.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600);

    if (signErr || !signedData) {
      return NextResponse.json({ error: 'Failed to create download URL' }, { status: 500 });
    }

    return NextResponse.json({ pdf_url: signedData.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function generateAcknowledgmentPDF(letter: any): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const PRIMARY: [number, number, number] = [79, 70, 229];
  const GRAY: [number, number, number] = [107, 114, 128];
  const BLACK: [number, number, number] = [17, 24, 39];
  const PAGE_WIDTH = 215.9;
  const MARGIN = 25;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

  // Header bar
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, PAGE_WIDTH, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(letter.org_name || branding.appName, MARGIN, 12);

  // Date (top right)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(dateStr, PAGE_WIDTH - MARGIN, 12, { align: 'right' });

  let y = 32;
  doc.setTextColor(...BLACK);

  // Donor address block
  const donor = letter.donors;
  if (donor) {
    const donorName =
      !donor.is_organization
        ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim()
        : donor.organization_name || '';

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (donorName) { doc.text(donorName, MARGIN, y); y += 5; }
    if (donor.address_line1) { doc.text(donor.address_line1, MARGIN, y); y += 5; }
    if (donor.address_line2) { doc.text(donor.address_line2, MARGIN, y); y += 5; }
    if (donor.city || donor.state || donor.zip) {
      doc.text(
        [donor.city, donor.state, donor.zip].filter(Boolean).join(', '),
        MARGIN, y
      );
      y += 5;
    }
    y += 5;
  }

  // Letter type label
  const typeLabel: Record<string, string> = {
    year_end: 'Year-End Tax Acknowledgment',
    receipt: 'Gift Receipt',
    qcd: 'Qualified Charitable Distribution Acknowledgment',
    non_cash: 'Non-Cash Contribution Acknowledgment',
    general: 'Letter',
  };

  // Subject
  if (letter.subject) {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    const subjectLines = doc.splitTextToSize(letter.subject, CONTENT_WIDTH);
    doc.text(subjectLines, MARGIN, y);
    y += subjectLines.length * 6 + 4;
  } else {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(typeLabel[letter.letter_type] || 'Acknowledgment Letter', MARGIN, y);
    y += 10;
  }

  // Separator
  doc.setDrawColor(...PRIMARY);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  // Body
  if (letter.body) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);

    const paragraphs = letter.body.split('\n');
    for (const para of paragraphs) {
      if (!para.trim()) {
        y += 4;
        continue;
      }
      const lines = doc.splitTextToSize(para, CONTENT_WIDTH);
      // Page break check
      if (y + lines.length * 5 > doc.internal.pageSize.height - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines, MARGIN, y);
      y += lines.length * 5 + 1;
    }
  }

  // EIN footer
  if (letter.org_ein) {
    y += 6;
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(`${letter.org_name || ''} · EIN: ${letter.org_ein} · This letter serves as your official tax receipt.`, MARGIN, y);
  }

  // Page footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text(
      `${letter.org_name || branding.appName} · ${typeLabel[letter.letter_type] || 'Acknowledgment'} · Page ${i} of ${pageCount}`,
      MARGIN,
      doc.internal.pageSize.height - 10
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}
