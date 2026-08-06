import { NextRequest, NextResponse } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

// GET /api/org/[orgId]/acknowledgments — list acknowledgment letters
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;
    const { searchParams } = new URL(req.url);

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
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    if (donorId) query = query.eq('donor_id', donorId);
    if (letterType) query = query.eq('letter_type', letterType);
    if (status) query = query.eq('status', status);

    const { data: letters, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ letters, count: letters?.length || 0 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}

// POST /api/org/[orgId]/acknowledgments — create acknowledgment letter
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'member');
    if (isAccessDenied(access)) return access.response;
    const supabase = access.context.db;

    const body = await req.json();
    const {
      donor_id, contribution_id, letter_type, subject, body: letterBody,
      custom_message, send_via, tax_year,
    } = body;

    if (!donor_id) {
      return json({ error: 'donor_id is required' }, { status: 400 });
    }

    const { data: donor, error: donorErr } = await supabase
      .from('donors')
      .select('*')
      .eq('id', donor_id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();

    if (donorErr || !donor) {
      return json({ error: 'Donor not found' }, { status: 404 });
    }

    let linkedContribution: any = null;
    if (contribution_id) {
      const { data: contribution } = await supabase
        .from('contributions_received')
        .select('id, amount, contribution_date, gift_type, tax_deductible_amount, donor_id')
        .eq('id', contribution_id)
        .eq('org_id', orgId)
        .eq('donor_id', donor_id)
        .maybeSingle();

      if (!contribution) {
        return json({ error: 'Contribution not found for this donor' }, { status: 404 });
      }
      linkedContribution = contribution;
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
          .select('amount, contribution_date, tax_deductible_amount')
          .eq('donor_id', donor_id)
          .eq('org_id', orgId)
          .gte('contribution_date', `${year}-01-01`)
          .lte('contribution_date', `${year}-12-31`);

        const total = (yearContribs || []).reduce((s, c) => s + Number(c.amount), 0);
        const deductible = (yearContribs || [])
          .reduce((s, c) => s + Number(c.tax_deductible_amount ?? 0), 0);

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
        if (linkedContribution) {
          contributionDetail = `\n  Date: ${new Date(linkedContribution.contribution_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n  Amount: $${Number(linkedContribution.amount).toLocaleString()}\n  Type: ${linkedContribution.gift_type}`;
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

    const { user } = access.context;

    const { data: letter, error } = await supabase
      .from('acknowledgment_letters')
      .insert({
        org_id: orgId,
        donor_id,
        contribution_ids: contribution_id ? [contribution_id] : [],
        letter_type: type,
        status: 'draft',
        subject: finalSubject,
        body: finalBody,
        delivery_method: send_via || 'email',
        sent_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    if (contribution_id) {
      const { error: contributionUpdateError } = await supabase
        .from('contributions_received')
        .update({ acknowledgment_sent: false })
        .eq('id', contribution_id)
        .eq('org_id', orgId)
        .eq('donor_id', donor_id);
      if (contributionUpdateError) {
        await supabase
          .from('acknowledgment_letters')
          .delete()
          .eq('id', letter.id)
          .eq('org_id', orgId);
        return json({ error: contributionUpdateError.message }, { status: 500 });
      }
    }

    return json(letter, { status: 201 });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
