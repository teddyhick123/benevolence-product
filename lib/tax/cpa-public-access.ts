import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase';
import {
  generateCSV,
  generateForm8283Summary,
  generateTXF,
  type TaxContributionExport,
} from '@/lib/tax/turbotax-export';
import { hashShareToken, validateShareLink, type CPAShareLink } from '@/lib/tax/cpa-collaboration';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type CPAPublicPermissions = CPAShareLink['permissions'] & {
  view_documents?: boolean;
};

type ShareLinkRow = Omit<CPAShareLink, 'permissions'> & {
  org_id: string;
  share_token: string;
  permissions: CPAPublicPermissions;
};

export type CPAPublicPayload = {
  share: {
    id: string;
    cpa_name?: string;
    cpa_email?: string;
    cpa_firm?: string;
    tax_years: number[];
    permissions: CPAPublicPermissions;
    expires_at?: string;
    access_count: number;
    max_accesses?: number;
  };
  selected_year: number;
  portfolio: { id: string; name: string | null };
  summary: any | null;
  contributions: TaxContributionExport[];
  carryforwards: any[];
  documents: any[];
};

export type CPAPublicResult =
  | { ok: true; link: ShareLinkRow; payload: CPAPublicPayload }
  | { ok: false; status: number; error: string };

function timingSafeHashMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeLink(link: ShareLinkRow): CPAPublicPayload['share'] {
  return {
    id: link.id,
    cpa_name: link.cpa_name,
    cpa_email: link.cpa_email,
    cpa_firm: link.cpa_firm,
    tax_years: link.tax_years,
    permissions: link.permissions,
    expires_at: link.expires_at,
    access_count: link.access_count,
    max_accesses: link.max_accesses,
  };
}

function pickYear(link: ShareLinkRow, requestedYear?: number): number {
  const years = [...(link.tax_years ?? [])].sort((a, b) => b - a);
  if (requestedYear && years.includes(requestedYear)) return requestedYear;
  return years[0] ?? new Date().getFullYear();
}

function toContributionExport(row: any): TaxContributionExport {
  return {
    id: row.id,
    contribution_date: row.contribution_date,
    tax_year: row.tax_year,
    recipient_name: row.recipient_name,
    recipient_ein: row.recipient_ein,
    recipient_type: row.recipient_type,
    contribution_type: row.contribution_type,
    amount_usd: Number(row.amount_usd ?? 0),
    fmv_at_donation: row.fmv_at_donation,
    cost_basis: row.cost_basis,
    property_description: row.property_description,
    deductible_amount: row.deductible_this_year ?? row.calculated_deductible_amount ?? row.deductible_amount,
    agi_limit_percentage: row.agi_limit_percentage,
    carryforward_eligible: row.carryforward_eligible,
    qcd_qualified: row.qcd_qualified,
    requires_appraisal: row.requires_appraisal,
    appraisal_value: row.appraisal_value,
    substantiation_status: row.substantiation_status,
  };
}

export async function getValidCPAShareLink(token: string): Promise<CPAPublicResult> {
  const supabase = createAdminClient();
  const tokenHash = hashShareToken(token);

  const { data: link, error } = await supabase
    .from('cpa_share_links')
    .select(`
      id,
      portfolio_id,
      org_id,
      share_token,
      cpa_name,
      cpa_email,
      cpa_firm,
      tax_years,
      permissions,
      expires_at,
      max_accesses,
      access_count,
      revoked_at,
      created_at,
      updated_at,
      notes
    `)
    .eq('share_token', tokenHash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: 'Unable to load share link' };
  if (!link || !timingSafeHashMatch(tokenHash, link.share_token)) {
    return { ok: false, status: 404, error: 'Share link not found' };
  }

  const validation = validateShareLink(link as ShareLinkRow);
  if (!validation.valid) {
    return { ok: false, status: 410, error: validation.reason ?? 'Share link is no longer valid' };
  }

  const payload = await buildCPAPayload(supabase, link as ShareLinkRow);
  return { ok: true, link: link as ShareLinkRow, payload };
}

async function buildCPAPayload(
  supabase: SupabaseAdmin,
  link: ShareLinkRow,
  requestedYear?: number
): Promise<CPAPublicPayload> {
  const selectedYear = pickYear(link, requestedYear);
  const permissions = link.permissions ?? ({} as CPAPublicPermissions);

  const [{ data: portfolio }, { data: summary }, { data: contributions }, { data: carryforwards }, { data: documents }] =
    await Promise.all([
      supabase.from('portfolios').select('id, name').eq('id', link.portfolio_id).maybeSingle(),
      permissions.view_tax_summary
        ? supabase
            .from('v_portfolio_tax_summary')
            .select('*')
            .eq('portfolio_id', link.portfolio_id)
            .eq('tax_year', selectedYear)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      permissions.view_contributions
        ? supabase
            .from('v_tax_contributions_with_limits')
            .select('*')
            .eq('portfolio_id', link.portfolio_id)
            .eq('tax_year', selectedYear)
            .order('contribution_date', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_carryforwards
        ? supabase
            .from('v_active_carryforwards')
            .select('*')
            .eq('portfolio_id', link.portfolio_id)
            .lte('originating_tax_year', selectedYear)
            .order('expires_tax_year', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_documents
        ? supabase
            .from('tax_documents')
            .select('id, contribution_id, tax_year, document_type, file_name, file_size, mime_type, created_at')
            .eq('portfolio_id', link.portfolio_id)
            .eq('tax_year', selectedYear)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  return {
    share: sanitizeLink(link),
    selected_year: selectedYear,
    portfolio: {
      id: link.portfolio_id,
      name: portfolio?.name ?? null,
    },
    summary: summary ?? null,
    contributions: (contributions ?? []).map(toContributionExport),
    carryforwards: carryforwards ?? [],
    documents: documents ?? [],
  };
}

export async function getCPAPortalPayload(
  token: string,
  options: { year?: number; ip?: string; userAgent?: string; logView?: boolean } = {}
): Promise<CPAPublicResult> {
  const result = await getValidCPAShareLink(token);
  if (!result.ok) return result;

  const supabase = createAdminClient();
  const payload = await buildCPAPayload(supabase, result.link, options.year);
  if (options.logView !== false) {
    await logCPAAccess(result.link, 'view', `year:${payload.selected_year}`, options.ip, options.userAgent);
  }

  return { ok: true, link: result.link, payload };
}

export async function logCPAAccess(
  link: ShareLinkRow,
  action: string,
  resource?: string,
  ipAddress?: string,
  userAgent?: string
) {
  const supabase = createAdminClient();
  await Promise.all([
    supabase
      .from('cpa_share_links')
      .update({ access_count: Number(link.access_count ?? 0) + 1 })
      .eq('id', link.id),
    supabase.from('cpa_access_logs').insert({
      share_link_id: link.id,
      action,
      resource,
      ip_address: ipAddress,
      user_agent: userAgent,
    }),
  ]);
}

export async function createCPADownload(
  token: string,
  options: {
    format: string;
    year?: number;
    documentId?: string | null;
    ip?: string;
    userAgent?: string;
  }
): Promise<
  | { ok: true; filename?: string; contentType?: string; body?: string; signedUrl?: string }
  | { ok: false; status: number; error: string }
> {
  const result = await getCPAPortalPayload(token, {
    year: options.year,
    ip: options.ip,
    userAgent: options.userAgent,
    logView: false,
  });
  if (!result.ok) return result;

  const { link, payload } = result;
  const permissions = link.permissions ?? ({} as CPAPublicPermissions);
  const year = payload.selected_year;

  if (options.format === 'csv') {
    if (!permissions.view_contributions) return { ok: false, status: 403, error: 'CSV access is not allowed' };
    await logCPAAccess(link, 'download_csv', `year:${year}`, options.ip, options.userAgent);
    return {
      ok: true,
      filename: `cpa-contributions-${year}.csv`,
      contentType: 'text/csv',
      body: generateCSV(payload.contributions, year),
    };
  }

  if (options.format === 'txf') {
    if (!permissions.download_turbotax) return { ok: false, status: 403, error: 'TXF access is not allowed' };
    await logCPAAccess(link, 'download_turbotax', `year:${year}`, options.ip, options.userAgent);
    return {
      ok: true,
      filename: `cpa-turbotax-${year}.txf`,
      contentType: 'text/plain',
      body: generateTXF(payload.contributions, year, payload.portfolio.name ?? 'Taxpayer'),
    };
  }

  if (options.format === 'form8283') {
    if (!permissions.download_form8283) return { ok: false, status: 403, error: 'Form 8283 access is not allowed' };
    await logCPAAccess(link, 'download_form8283', `year:${year}`, options.ip, options.userAgent);
    return {
      ok: true,
      filename: `cpa-form-8283-summary-${year}.txt`,
      contentType: 'text/plain',
      body: generateForm8283Summary(payload.contributions, year),
    };
  }

  if (options.format === 'document') {
    if (!permissions.view_documents) return { ok: false, status: 403, error: 'Document access is not allowed' };
    if (!options.documentId) return { ok: false, status: 400, error: 'documentId is required' };

    const supabase = createAdminClient();
    const { data: document, error } = await supabase
      .from('tax_documents')
      .select('id, file_name, storage_path, tax_year')
      .eq('id', options.documentId)
      .eq('portfolio_id', link.portfolio_id)
      .in('tax_year', link.tax_years)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: 'Unable to load document' };
    if (!document) return { ok: false, status: 404, error: 'Document not found' };

    const { data: signed, error: signedError } = await supabase.storage
      .from('tax-documents')
      .createSignedUrl(document.storage_path, 3600);

    if (signedError || !signed?.signedUrl) {
      return { ok: false, status: 500, error: 'Unable to create signed document URL' };
    }

    await logCPAAccess(link, 'download_document', document.id, options.ip, options.userAgent);
    return { ok: true, signedUrl: signed.signedUrl, filename: document.file_name };
  }

  return { ok: false, status: 400, error: 'Unsupported download format' };
}
