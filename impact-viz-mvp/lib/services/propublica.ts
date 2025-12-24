/**
 * ProPublica Nonprofit Explorer API Client
 *
 * Free API for accessing IRS Form 990 data for US nonprofits
 * API Docs: https://projects.propublica.org/nonprofits/api
 *
 * No API key required - rate limited to reasonable usage
 */

const PROPUBLICA_BASE_URL = 'https://projects.propublica.org/nonprofits/api/v2';

export interface ProPublicaOrganization {
  ein: string;
  name: string;
  city: string;
  state: string;
  ntee_code?: string;
  subsection_code?: string;
  filing_type?: string;
  asset_amount?: number;
  income_amount?: number;
  revenue_amount?: number;
  expense_amount?: number;
  organization?: {
    name: string;
    ein: string;
    city: string;
    state: string;
    ntee_code?: string;
    subsection_code?: string;
  };
  filings_with_data?: Array<{
    tax_prd: string;
    tax_prd_yr: string;
    totrevenue?: number;
    totfuncexpns?: number;
    totassetsend?: number;
    totliabend?: number;
    url?: string;
  }>;
}

export interface ProPublicaSearchResult {
  total_results: number;
  organizations: ProPublicaOrganization[];
}

/**
 * Search for organizations by query
 */
export async function searchOrganizations(query: string, state?: string): Promise<ProPublicaSearchResult> {
  try {
    const params = new URLSearchParams({ q: query });
    if (state) params.append('state[id]', state);

    const response = await fetch(`${PROPUBLICA_BASE_URL}/search.json?${params.toString()}`, {
      headers: {
        'User-Agent': 'Benevolence-Impact-Viz/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`ProPublica API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching ProPublica:', error);
    throw error;
  }
}

/**
 * Get organization details by EIN
 */
export async function getOrganization(ein: string): Promise<ProPublicaOrganization | null> {
  try {
    const response = await fetch(`${PROPUBLICA_BASE_URL}/organizations/${ein}.json`, {
      headers: {
        'User-Agent': 'Benevolence-Impact-Viz/1.0',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`ProPublica API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.organization || data;
  } catch (error) {
    console.error(`Error fetching organization ${ein} from ProPublica:`, error);
    throw error;
  }
}

/**
 * Convert ProPublica data to our charity format
 */
export function convertToCharity(org: ProPublicaOrganization) {
  // Get most recent filing data
  const latestFiling = org.filings_with_data?.[0];

  // Map NTEE code to sector
  const nteeCode = org.ntee_code || org.organization?.ntee_code;
  const sector = mapNTEEtoSector(nteeCode);

  return {
    ein: org.ein || org.organization?.ein,
    name: org.name || org.organization?.name,
    city: org.city || org.organization?.city,
    state: org.state || org.organization?.state,
    ntee_code: nteeCode,
    sector,
    annual_revenue: latestFiling?.totrevenue || org.revenue_amount || org.income_amount,
    annual_expenses: latestFiling?.totfuncexpns || org.expense_amount,
    assets: latestFiling?.totassetsend || org.asset_amount,
    irs_deductibility_status: org.subsection_code || org.organization?.subsection_code,
    last_form_990_date: latestFiling?.tax_prd,
    data_source: 'propublica',
  };
}

/**
 * Map NTEE code to our sector categories
 * NTEE codes: https://nccs.urban.org/publication/irs-activity-codes
 */
function mapNTEEtoSector(nteeCode?: string): string | undefined {
  if (!nteeCode) return undefined;

  const prefix = nteeCode.charAt(0).toUpperCase();

  const sectorMap: Record<string, string> = {
    'A': 'Arts & Culture',
    'B': 'Education',
    'C': 'Environment',
    'D': 'Animals',
    'E': 'Health',
    'F': 'Mental Health',
    'G': 'Health',
    'H': 'Health',
    'I': 'Crime & Legal',
    'J': 'Employment',
    'K': 'Food & Agriculture',
    'L': 'Housing',
    'M': 'Public Safety',
    'N': 'Recreation & Sports',
    'O': 'Youth Programs',
    'P': 'Human Services',
    'Q': 'International',
    'R': 'Civil Rights',
    'S': 'Community Development',
    'T': 'Philanthropy',
    'U': 'Science & Technology',
    'V': 'Social Science',
    'W': 'Public Affairs',
    'X': 'Religion',
    'Y': 'Professional Associations',
    'Z': 'Unknown',
  };

  return sectorMap[prefix] || 'Other';
}

/**
 * Batch import organizations by state
 * Useful for populating the database with charities from specific regions
 */
export async function importByState(state: string, limit: number = 100): Promise<any[]> {
  const charities: any[] = [];

  // ProPublica doesn't have a direct "get all by state" endpoint
  // We'll need to search for common terms to get results
  const searchTerms = ['foundation', 'charity', 'fund', 'society', 'trust', 'association'];

  for (const term of searchTerms) {
    if (charities.length >= limit) break;

    try {
      const results = await searchOrganizations(term, state);

      for (const org of results.organizations) {
        if (charities.length >= limit) break;

        const charity = convertToCharity(org);
        if (charity.ein) {
          charities.push(charity);
        }
      }

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error importing from state ${state} with term "${term}":`, error);
    }
  }

  return charities;
}
