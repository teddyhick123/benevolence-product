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

type CPAShareLinkResult =
  | { ok: true; link: ShareLinkRow }
  | { ok: false; status: number; error: string };

type CPAAccessResult =
  | { ok: true; access_count: number | null }
  | { ok: false; status: number; error: string };

const CPA_SHARE_LINK_SELECT = `
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
`;

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

async function loadValidCPAShareLink(token: string): Promise<CPAShareLinkResult> {
  const supabase = createAdminClient();
  const tokenHash = hashShareToken(token);

  const { data: link, error } = await supabase
    .from('cpa_share_links')
    .select(CPA_SHARE_LINK_SELECT)
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

  return { ok: true, link: link as ShareLinkRow };
}

async function refreshValidCPAShareLink(
  supabase: SupabaseAdmin,
  link: ShareLinkRow
): Promise<CPAShareLinkResult> {
  const { data: currentLink, error } = await supabase
    .from('cpa_share_links')
    .select(CPA_SHARE_LINK_SELECT)
    .eq('id', link.id)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: 'Unable to refresh share link' };
  if (!currentLink || !timingSafeHashMatch(link.share_token, currentLink.share_token)) {
    return { ok: false, status: 404, error: 'Share link not found' };
  }

  const validation = validateShareLink(currentLink as ShareLinkRow);
  if (!validation.valid) {
    return { ok: false, status: 410, error: validation.reason ?? 'Share link is no longer valid' };
  }

  return { ok: true, link: currentLink as ShareLinkRow };
}

export async function getValidCPAShareLink(token: string): Promise<CPAPublicResult> {
  const result = await loadValidCPAShareLink(token);
  if (!result.ok) return result;

  const supabase = createAdminClient();
  return buildCPAPayload(supabase, result.link);
}

async function buildCPAPayload(
  supabase: SupabaseAdmin,
  link: ShareLinkRow,
  requestedYear?: number
): Promise<CPAPublicResult> {
  const refreshed = await refreshValidCPAShareLink(supabase, link);
  if (!refreshed.ok) return refreshed;

  const activeLink = refreshed.link;
  const selectedYear = pickYear(activeLink, requestedYear);
  const permissions = activeLink.permissions ?? ({} as CPAPublicPermissions);

  const [{ data: portfolio }, { data: summary }, { data: contributions }, { data: carryforwards }, { data: documents }] =
    await Promise.all([
      supabase.from('portfolios').select('id, name').eq('id', activeLink.portfolio_id).maybeSingle(),
      permissions.view_tax_summary
        ? supabase
            .from('v_portfolio_tax_summary')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('tax_year', selectedYear)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      permissions.view_contributions
        ? supabase
            .from('v_tax_contributions_with_limits')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('tax_year', selectedYear)
            .order('contribution_date', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_carryforwards
        ? supabase
            .from('v_active_carryforwards')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .lte('originating_tax_year', selectedYear)
            .order('expires_tax_year', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_documents
        ? supabase
            .from('tax_documents')
            .select('id, tax_contribution_id, tax_year, document_type, file_name, file_size_bytes, mime_type, uploaded_at, created_at')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('tax_year', selectedYear)
            .order('uploaded_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  const finalRefresh = await refreshValidCPAShareLink(supabase, activeLink);
  if (!finalRefresh.ok) return finalRefresh;

  return {
    ok: true,
    link: finalRefresh.link,
    payload: {
      share: sanitizeLink(finalRefresh.link),
      selected_year: selectedYear,
      portfolio: {
        id: activeLink.portfolio_id,
        name: portfolio?.name ?? null,
      },
      summary: summary ?? null,
      contributions: (contributions ?? []).map(toContributionExport),
      carryforwards: carryforwards ?? [],
      documents: (documents ?? []).map((document: any) => ({
        ...document,
        contribution_id: document.tax_contribution_id,
        file_size: document.file_size_bytes,
      })),
    },
  };
}

export async function getCPAPortalPayload(
  token: string,
  options: { year?: number; ip?: string; userAgent?: string; logView?: boolean } = {}
): Promise<CPAPublicResult> {
  const result = await loadValidCPAShareLink(token);
  if (!result.ok) return result;

  const supabase = createAdminClient();
  if (options.logView !== false) {
    const selectedYear = pickYear(result.link, options.year);
    const access = await logCPAAccess(result.link, 'view', `year:${selectedYear}`, options.ip, options.userAgent);
    if (!access.ok) return access;
  }

  return buildCPAPayload(supabase, result.link, options.year);
}

export async function logCPAAccess(
  link: ShareLinkRow,
  action: string,
  resource?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<CPAAccessResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('record_cpa_access', {
    p_share_link_id: link.id,
    p_action: action,
    p_resource: resource ?? null,
    p_ip_address: ipAddress ?? null,
    p_user_agent: userAgent ?? null,
  });

  if (error) return { ok: false, status: 500, error: 'Unable to record CPA access' };

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.access_granted) {
    return {
      ok: false,
      status: 410,
      error: result?.reason ?? 'Share link is no longer valid',
    };
  }

  return {
    ok: true,
    access_count: typeof result.access_count === 'number' ? result.access_count : null,
  };
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
  const result = await loadValidCPAShareLink(token);
  if (!result.ok) return result;

  const supabase = createAdminClient();
  const refreshed = await refreshValidCPAShareLink(supabase, result.link);
  if (!refreshed.ok) return refreshed;

  const { link } = refreshed;
  const permissions = link.permissions ?? ({} as CPAPublicPermissions);
  const year = pickYear(link, options.year);

  if (options.format === 'csv') {
    if (!permissions.view_contributions) return { ok: false, status: 403, error: 'CSV access is not allowed' };
    const access = await logCPAAccess(link, 'download_csv', `year:${year}`, options.ip, options.userAgent);
    if (!access.ok) return access;
    const payloadResult = await buildCPAPayload(supabase, link, year);
    if (!payloadResult.ok) return payloadResult;
    return {
      ok: true,
      filename: `cpa-contributions-${year}.csv`,
      contentType: 'text/csv',
      body: generateCSV(payloadResult.payload.contributions, year),
    };
  }

  if (options.format === 'txf') {
    if (!permissions.download_turbotax) return { ok: false, status: 403, error: 'TXF access is not allowed' };
    const access = await logCPAAccess(link, 'download_turbotax', `year:${year}`, options.ip, options.userAgent);
    if (!access.ok) return access;
    const payloadResult = await buildCPAPayload(supabase, link, year);
    if (!payloadResult.ok) return payloadResult;
    return {
      ok: true,
      filename: `cpa-turbotax-${year}.txf`,
      contentType: 'text/plain',
      body: generateTXF(payloadResult.payload.contributions, year, payloadResult.payload.portfolio.name ?? 'Taxpayer'),
    };
  }

  if (options.format === 'form8283') {
    if (!permissions.download_form8283) return { ok: false, status: 403, error: 'Form 8283 access is not allowed' };
    const access = await logCPAAccess(link, 'download_form8283', `year:${year}`, options.ip, options.userAgent);
    if (!access.ok) return access;
    const payloadResult = await buildCPAPayload(supabase, link, year);
    if (!payloadResult.ok) return payloadResult;
    return {
      ok: true,
      filename: `cpa-form-8283-summary-${year}.txt`,
      contentType: 'text/plain',
      body: generateForm8283Summary(payloadResult.payload.contributions, year),
    };
  }

  if (options.format === 'document') {
    if (!permissions.view_documents) return { ok: false, status: 403, error: 'Document access is not allowed' };
    if (!options.documentId) return { ok: false, status: 400, error: 'documentId is required' };

    const { data: document, error } = await supabase
      .from('tax_documents')
      .select('id, file_name, storage_path, tax_year')
      .eq('id', options.documentId)
      .eq('portfolio_id', link.portfolio_id)
      .in('tax_year', link.tax_years)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: 'Unable to load document' };
    if (!document) return { ok: false, status: 404, error: 'Document not found' };

    const access = await logCPAAccess(link, 'download_document', document.id, options.ip, options.userAgent);
    if (!access.ok) return access;

    const finalRefresh = await refreshValidCPAShareLink(supabase, link);
    if (!finalRefresh.ok) return finalRefresh;

    const { data: signed, error: signedError } = await supabase.storage
      .from('tax-documents')
      .createSignedUrl(document.storage_path, 3600);

    if (signedError || !signed?.signedUrl) {
      return { ok: false, status: 500, error: 'Unable to create signed document URL' };
    }

    return { ok: true, signedUrl: signed.signedUrl, filename: document.file_name };
  }

  return { ok: false, status: 400, error: 'Unsupported download format' };
}
