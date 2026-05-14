import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// GET /api/org/[orgId]/acknowledgments — list acknowledgment letters
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();
    const { searchParams } = new URL(req.url);

    const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
    if (!role) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let query = supabase
      .from('acknowledgment_letters')
      .select(`
        *,
        donors(id, first_name, last_name, organization_name, is_organization, email)
      `)
      .eq('org_id', orgId);

    const donorId = searchParams.get('donor_id');
    const letterType = searchParams.get('letter_type');
    const status = searchParams.get('status');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (donorId) query = query.eq('donor_id', donorId);
    if (letterType) query = query.eq('letter_type', letterType);
    if (status) query = query.eq('status', status);

    const { data: letters, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ letters, count: letters?.length || 0 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/acknowledgments — create acknowledgment letter
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const supabase = await createServerClient();

    const { data: canEdit } = await supabase.rpc('can_edit_org', { p_org_id: orgId });
    if (!canEdit) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await req.json();
    const {
      donor_id, contribution_id, letter_type, subject, body: letterBody,
      custom_message, send_via, tax_year,
    } = body;

    if (!donor_id) {
      return NextResponse.json({ error: 'donor_id is required' }, { status: 400 });
    }

    const { data: donor, error: donorErr } = await supabase
      .from('donors')
      .select('*')
      .eq('id', donor_id)
      .eq('org_id', orgId)
      .single();

    if (donorErr || !donor) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('name, ein')
      .eq('id', orgId)
      .single();

    const donorName = !donor.is_organization
      ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Donor'
      : donor.organization_name || 'Donor';

    const type = letter_type || 'receipt';
    let finalSubject = subject;
    let finalBody = letterBody;

    if (!finalBody) {
      const orgName = org?.name || 'our organization';
      const ein = org?.ein ? `\nEIN: ${org.ein}` : '';

      if (type === 'year_end') {
        const year = tax_year || new Date().getFullYear() - 1;
        const { data: yearContribs } = await supabase
          .from('contributions_received')
          .select('amount, contribution_date, is_tax_deductible')
          .eq('donor_id', donor_id)
          .eq('org_id', orgId)
          .gte('contribution_date', `${year}-01-01`)
          .lte('contribution_date', `${year}-12-31`);

        const total = (yearContribs || []).reduce((s, c) => s + Number(c.amount), 0);
        const deductible = (yearContribs || [])
          .filter(c => c.is_tax_deductible)
          .reduce((s, c) => s + Number(c.amount), 0);

        finalSubject = finalSubject || `Your ${year} Year-End Tax Summary — ${orgName}`;
        finalBody = `Dear ${donorName},

Thank you for your generous support of ${orgName} in ${year}.

Your ${year} Giving Summary:
  Total Contributions: $${total.toLocaleString()}
  Tax-Deductible Amount: $${deductible.toLocaleString()}
  Number of Gifts: ${(yearContribs || []).length}

No goods or services were provided in exchange for your contribution(s) unless otherwise noted.${ein}

${custom_message || 'We are deeply grateful for your partnership in our mission.'}

With gratitude,
${orgName}`;
      } else if (type === 'receipt') {
        let contributionDetail = '';
        if (contribution_id) {
          const { data: contrib } = await supabase
            .from('contributions_received')
            .select('amount, contribution_date, contribution_type')
            .eq('id', contribution_id)
            .single();
          if (contrib) {
            contributionDetail = `\n  Date: ${new Date(contrib.contribution_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n  Amount: $${Number(contrib.amount).toLocaleString()}\n  Type: ${contrib.contribution_type}`;
          }
        }

        finalSubject = finalSubject || `Gift Receipt — ${orgName}`;
        finalBody = `Dear ${donorName},

Thank you for your contribution to ${orgName}. This letter serves as your official gift receipt.${contributionDetail}

No goods or services were provided in exchange for this gift.${ein}

${custom_message || ''}

With thanks,
${orgName}`;
      } else if (type === 'qcd') {
        finalSubject = finalSubject || `Qualified Charitable Distribution Acknowledgment — ${orgName}`;
        finalBody = `Dear ${donorName},

Thank you for your Qualified Charitable Distribution (QCD) to ${orgName}.

As required by the IRS, please retain this acknowledgment for your records. ${orgName} is a 501(c)(3) organization and no goods or services were provided in exchange for this contribution.${ein}

${custom_message || ''}

Sincerely,
${orgName}`;
      } else if (type === 'non_cash') {
        finalSubject = finalSubject || `Non-Cash Contribution Acknowledgment — ${orgName}`;
        finalBody = `Dear ${donorName},

Thank you for your non-cash gift to ${orgName}. We have received the property described below.

${custom_message || `Please note that ${orgName} did not provide goods or services in exchange for this contribution. As a donor, you are responsible for obtaining a qualified appraisal for contributions of property valued over $5,000.`}${ein}

With gratitude,
${orgName}`;
      } else {
        finalSubject = finalSubject || `Message from ${orgName}`;
        finalBody = custom_message || '';
      }
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .insert({
        org_id: orgId,
        donor_id,
        contribution_ids: contribution_id ? [contribution_id] : [],
        status: 'draft',
        subject: finalSubject,
        body: finalBody,
        delivery_method: send_via || 'email',
        sent_by: user?.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (contribution_id) {
      await supabase
        .from('contributions_received')
        .update({ acknowledgment_sent: false })
        .eq('id', contribution_id);
    }

    return NextResponse.json(letter, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
