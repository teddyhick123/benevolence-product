import crypto from 'crypto';
import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';
import type { CpaShareAccessContext } from '@/lib/api/principals';
import {
  generateCSV,
  generateForm8283Summary,
  generateTXF,
  type TaxContributionExport,
} from '@/lib/tax/turbotax-export';
import { hashShareToken, validateShareLink } from '@/lib/tax/cpa-collaboration';

const TAX_DOCUMENT_BUCKET = 'tax-documents';

export type CpaPublicPermissions = Record<string, boolean> & {
  view_contributions: boolean;
  view_carryforwards: boolean;
  view_donor_profile: boolean;
  view_tax_summary: boolean;
  view_documents?: boolean;
  download_form8283: boolean;
  download_turbotax: boolean;
};

export type CpaShareLinkRow = {
  id: string;
  portfolio_id: string;
  org_id: string;
  share_token: string;
  cpa_name?: string;
  cpa_email?: string;
  cpa_firm?: string;
  tax_years: number[];
  permissions: CpaPublicPermissions;
  expires_at?: string;
  max_accesses?: number;
  access_count: number;
  revoked_at?: string;
  created_at: string;
  updated_at?: string;
  notes?: string;
};

export type CpaPublicPayload = {
  share: {
    id: string;
    cpa_name?: string;
    cpa_email?: string;
    cpa_firm?: string;
    tax_years: number[];
    permissions: CpaPublicPermissions;
    expires_at?: string;
    access_count: number;
    max_accesses?: number;
  };
  selected_year: number;
  portfolio: { id: string; name: string | null };
  summary: Record<string, unknown> | null;
  contributions: TaxContributionExport[];
  carryforwards: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
};

export type CpaPublicResult =
  | { ok: true; link: CpaShareLinkRow; payload: CpaPublicPayload }
  | CpaRepositoryDenied;

export type CpaDownloadResult =
  | { ok: true; filename?: string; contentType?: string; body?: string; signedUrl?: string }
  | CpaRepositoryDenied;

export type CpaRepositoryDenied = {
  ok: false;
  status: number;
  error: string;
};

type CpaShareLinkResult =
  | { ok: true; link: CpaShareLinkRow }
  | CpaRepositoryDenied;

type CpaAccessResult =
  | { ok: true; access_count: number | null }
  | CpaRepositoryDenied;

export type CpaShareRepository = ReturnType<typeof createScopedCpaShareRepository>;

export type ResolvedCpaToken =
  | {
      ok: true;
      context: CpaShareAccessContext;
      repository: CpaShareRepository;
    }
  | CpaRepositoryDenied;

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

function validateActiveLink(link: CpaShareLinkRow): CpaRepositoryDenied | null {
  const validation = validateShareLink(link);
  if (!validation.valid) {
    return {
      ok: false,
      status: 410,
      error: validation.reason ?? 'Share link is no longer valid',
    };
  }
  if (
    link.max_accesses !== undefined
    && link.access_count >= link.max_accesses
  ) {
    return {
      ok: false,
      status: 410,
      error: 'This share link has reached its maximum number of accesses.',
    };
  }
  return null;
}

function sanitizeLink(link: CpaShareLinkRow): CpaPublicPayload['share'] {
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

function pickYear(link: CpaShareLinkRow, requestedYear?: number): number {
  const years = [...(link.tax_years ?? [])].sort((a, b) => b - a);
  if (requestedYear && years.includes(requestedYear)) return requestedYear;
  return years[0] ?? new Date().getFullYear();
}

function toContributionExport(row: Record<string, unknown>): TaxContributionExport {
  return {
    id: String(row.id),
    contribution_date: String(row.contribution_date),
    tax_year: Number(row.tax_year),
    recipient_name: String(row.recipient_name ?? ''),
    recipient_ein: row.recipient_ein as string | undefined,
    recipient_type: row.recipient_type as string | undefined,
    contribution_type: row.contribution_type as TaxContributionExport['contribution_type'],
    amount_usd: Number(row.amount_usd ?? 0),
    fmv_at_donation: row.fmv_at_donation as number | undefined,
    cost_basis: row.cost_basis as number | undefined,
    property_description: row.property_description as string | undefined,
    deductible_amount: (
      row.deductible_this_year
      ?? row.calculated_deductible_amount
      ?? row.deductible_amount
    ) as number | undefined,
    agi_limit_percentage: row.agi_limit_percentage as number | undefined,
    carryforward_eligible: row.carryforward_eligible as boolean | undefined,
    qcd_qualified: row.qcd_qualified as boolean | undefined,
    requires_appraisal: row.requires_appraisal as boolean | undefined,
    appraisal_value: row.appraisal_value as number | undefined,
    substantiation_status: row.substantiation_status as string | undefined,
  };
}

function assertScopedDocumentPath(link: CpaShareLinkRow, document: {
  tax_contribution_id: string | null;
  storage_path: string;
}) {
  const prefix = `${link.portfolio_id}/${document.tax_contribution_id ?? ''}/`;
  if (
    !document.tax_contribution_id
    || !document.storage_path.startsWith(prefix)
    || document.storage_path.includes('..')
    || document.storage_path.includes('\\')
  ) {
    throw new Error('CPA document storage path is outside the authorized scope');
  }
}

function createScopedCpaShareRepository(
  initialLink: CpaShareLinkRow,
  db: ElevatedClient = createElevatedClient()
) {

  async function refreshValidLink(link: CpaShareLinkRow): Promise<CpaShareLinkResult> {
    const { data: currentLink, error } = await db
      .from('cpa_share_links')
      .select(CPA_SHARE_LINK_SELECT)
      .eq('id', link.id)
      .eq('portfolio_id', link.portfolio_id)
      .eq('org_id', link.org_id)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: 'Unable to refresh share link' };
    if (
      !currentLink
      || !timingSafeHashMatch(link.share_token, currentLink.share_token)
    ) {
      return { ok: false, status: 404, error: 'Share link not found' };
    }

    const activeLink = currentLink as CpaShareLinkRow;
    const invalid = validateActiveLink(activeLink);
    return invalid ?? { ok: true, link: activeLink };
  }

  async function recordAccess(
    link: CpaShareLinkRow,
    action: string,
    resource?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<CpaAccessResult> {
    const { data, error } = await db.rpc('record_cpa_access', {
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

  async function buildPayload(
    link: CpaShareLinkRow,
    requestedYear?: number
  ): Promise<CpaPublicResult> {
    const refreshed = await refreshValidLink(link);
    if (!refreshed.ok) return refreshed;

    const activeLink = refreshed.link;
    const selectedYear = pickYear(activeLink, requestedYear);
    const permissions = activeLink.permissions ?? ({} as CpaPublicPermissions);

    const [
      { data: portfolio },
      { data: summary },
      { data: contributions },
      { data: carryforwards },
      { data: documents },
    ] = await Promise.all([
      db
        .from('portfolios')
        .select('id, name')
        .eq('id', activeLink.portfolio_id)
        .eq('org_id', activeLink.org_id)
        .maybeSingle(),
      permissions.view_tax_summary
        ? db
            .from('v_portfolio_tax_summary')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('tax_year', selectedYear)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      permissions.view_contributions
        ? db
            .from('v_tax_contributions_with_limits')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('tax_year', selectedYear)
            .order('contribution_date', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_carryforwards
        ? db
            .from('v_active_carryforwards')
            .select('*')
            .eq('portfolio_id', activeLink.portfolio_id)
            .lte('originating_tax_year', selectedYear)
            .order('expires_tax_year', { ascending: true })
        : Promise.resolve({ data: [] }),
      permissions.view_documents
        ? db
            .from('tax_documents')
            .select('id, tax_contribution_id, tax_year, document_type, file_name, file_size_bytes, mime_type, uploaded_at, created_at')
            .eq('portfolio_id', activeLink.portfolio_id)
            .eq('org_id', activeLink.org_id)
            .eq('tax_year', selectedYear)
            .order('uploaded_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const finalRefresh = await refreshValidLink(activeLink);
    if (!finalRefresh.ok) return finalRefresh;

    const contributionRows = (contributions ?? []) as Array<Record<string, unknown>>;
    const carryforwardRows = (carryforwards ?? []) as Array<Record<string, unknown>>;
    const documentRows = (documents ?? []) as Array<Record<string, unknown>>;
    const portfolioRow = portfolio as { name?: string } | null;

    return {
      ok: true,
      link: finalRefresh.link,
      payload: {
        share: sanitizeLink(finalRefresh.link),
        selected_year: selectedYear,
        portfolio: {
          id: activeLink.portfolio_id,
          name: portfolioRow?.name ?? null,
        },
        summary: (summary as Record<string, unknown> | null) ?? null,
        contributions: contributionRows.map(toContributionExport),
        carryforwards: carryforwardRows,
        documents: documentRows.map((document) => ({
          ...document,
          contribution_id: document.tax_contribution_id,
          file_size: document.file_size_bytes,
        })),
      },
    };
  }

  return {
    async getPortalPayload(options: {
      year?: number;
      ip?: string;
      userAgent?: string;
      logView?: boolean;
    } = {}): Promise<CpaPublicResult> {
      if (options.logView !== false) {
        const selectedYear = pickYear(initialLink, options.year);
        const access = await recordAccess(
          initialLink,
          'view',
          `year:${selectedYear}`,
          options.ip,
          options.userAgent
        );
        if (!access.ok) return access;
      }

      return buildPayload(initialLink, options.year);
    },

    async createDownload(options: {
      format: string;
      year?: number;
      documentId?: string | null;
      ip?: string;
      userAgent?: string;
    }): Promise<CpaDownloadResult> {
      const refreshed = await refreshValidLink(initialLink);
      if (!refreshed.ok) return refreshed;

      const { link } = refreshed;
      const permissions = link.permissions ?? ({} as CpaPublicPermissions);
      const year = pickYear(link, options.year);

      if (options.format === 'csv') {
        if (!permissions.view_contributions) {
          return { ok: false, status: 403, error: 'CSV access is not allowed' };
        }
        const access = await recordAccess(link, 'download_csv', `year:${year}`, options.ip, options.userAgent);
        if (!access.ok) return access;
        const payloadResult = await buildPayload(link, year);
        if (!payloadResult.ok) return payloadResult;
        return {
          ok: true,
          filename: `cpa-contributions-${year}.csv`,
          contentType: 'text/csv',
          body: generateCSV(payloadResult.payload.contributions, year),
        };
      }

      if (options.format === 'txf') {
        if (!permissions.download_turbotax) {
          return { ok: false, status: 403, error: 'TXF access is not allowed' };
        }
        const access = await recordAccess(link, 'download_turbotax', `year:${year}`, options.ip, options.userAgent);
        if (!access.ok) return access;
        const payloadResult = await buildPayload(link, year);
        if (!payloadResult.ok) return payloadResult;
        return {
          ok: true,
          filename: `cpa-turbotax-${year}.txf`,
          contentType: 'text/plain',
          body: generateTXF(
            payloadResult.payload.contributions,
            year,
            payloadResult.payload.portfolio.name ?? 'Taxpayer'
          ),
        };
      }

      if (options.format === 'form8283') {
        if (!permissions.download_form8283) {
          return { ok: false, status: 403, error: 'Form 8283 access is not allowed' };
        }
        const access = await recordAccess(link, 'download_form8283', `year:${year}`, options.ip, options.userAgent);
        if (!access.ok) return access;
        const payloadResult = await buildPayload(link, year);
        if (!payloadResult.ok) return payloadResult;
        return {
          ok: true,
          filename: `cpa-form-8283-summary-${year}.txt`,
          contentType: 'text/plain',
          body: generateForm8283Summary(payloadResult.payload.contributions, year),
        };
      }

      if (options.format === 'document') {
        if (!permissions.view_documents) {
          return { ok: false, status: 403, error: 'Document access is not allowed' };
        }
        if (!options.documentId) {
          return { ok: false, status: 400, error: 'documentId is required' };
        }

        const { data: document, error } = await db
          .from('tax_documents')
          .select('id, tax_contribution_id, file_name, storage_path, tax_year')
          .eq('id', options.documentId)
          .eq('portfolio_id', link.portfolio_id)
          .eq('org_id', link.org_id)
          .in('tax_year', link.tax_years)
          .maybeSingle();

        if (error) return { ok: false, status: 500, error: 'Unable to load document' };
        if (!document) return { ok: false, status: 404, error: 'Document not found' };

        const access = await recordAccess(
          link,
          'download_document',
          document.id,
          options.ip,
          options.userAgent
        );
        if (!access.ok) return access;

        const finalRefresh = await refreshValidLink(link);
        if (!finalRefresh.ok) return finalRefresh;

        try {
          assertScopedDocumentPath(link, document);
        } catch {
          return { ok: false, status: 404, error: 'Document not found' };
        }

        const { data: signed, error: signedError } = await db.storage
          .from(TAX_DOCUMENT_BUCKET)
          .createSignedUrl(document.storage_path, 3600);

        if (signedError || !signed?.signedUrl) {
          return { ok: false, status: 500, error: 'Unable to create signed document URL' };
        }

        return { ok: true, signedUrl: signed.signedUrl, filename: document.file_name };
      }

      return { ok: false, status: 400, error: 'Unsupported download format' };
    },
  };
}

/**
 * Bootstrap a public CPA bearer token into a principal-scoped repository.
 * The elevated client and persisted token hash remain private to this module.
 */
export async function resolveCpaToken(token: string): Promise<ResolvedCpaToken> {
  const db = createElevatedClient();
  const tokenHash = hashShareToken(token);

  const { data: link, error } = await db
    .from('cpa_share_links')
    .select(CPA_SHARE_LINK_SELECT)
    .eq('share_token', tokenHash)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: 'Unable to load share link' };
  if (!link || !timingSafeHashMatch(tokenHash, link.share_token)) {
    return { ok: false, status: 404, error: 'Share link not found' };
  }

  const activeLink = link as CpaShareLinkRow;
  const invalid = validateActiveLink(activeLink);
  if (invalid) return invalid;

  const context: CpaShareAccessContext = {
    principal: { kind: 'cpa_share', shareLinkId: activeLink.id },
    orgId: activeLink.org_id,
    portfolioId: activeLink.portfolio_id,
    taxYears: activeLink.tax_years,
    permissions: activeLink.permissions,
  };

  return {
    ok: true,
    context,
    repository: createScopedCpaShareRepository(activeLink, db),
  };
}
