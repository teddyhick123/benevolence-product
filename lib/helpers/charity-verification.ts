/**
 * IRS Pub 78 Charity Verification Helper
 *
 * Purpose: Verify that charitable organizations are IRS-qualified for tax deductions
 *
 * IRS Pub 78 is the official IRS database of organizations eligible to receive
 * tax-deductible charitable contributions.
 *
 * API Documentation: https://www.irs.gov/charities-non-profits/tax-exempt-organization-search
 */

export interface CharityVerificationResult {
  isVerified: boolean;
  ein?: string;
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  deductibilityStatus?: '501c3_public' | '501c3_private_foundation' | 'other';
  verificationMethod: 'irs_api' | 'manual' | 'cached' | 'not_verified';
  verifiedAt?: string;
  errorMessage?: string;
  publicCharityCode?: string; // PC, PF, etc.
  warnings?: string[];
}

export interface IRSPub78SearchParams {
  ein?: string;
  name?: string;
  city?: string;
  state?: string;
}

/**
 * Verify a charity using IRS Tax Exempt Organization Search (TEOS)
 *
 * Note: This function requires an API key or direct access to IRS data.
 * For production use, you should implement proper API integration.
 */
export async function verifyCharityWithIRS(
  params: IRSPub78SearchParams
): Promise<CharityVerificationResult> {
  try {
    // For now, this is a placeholder that demonstrates the structure
    // In production, you would call the IRS TEOS API or use a third-party service

    // Example IRS TEOS API endpoint (requires authentication):
    // https://apps.irs.gov/app/eos/

    // For demo purposes, we'll return a mock verification
    // In production, replace with actual API call

    const mockVerification: CharityVerificationResult = {
      isVerified: false,
      verificationMethod: 'not_verified',
      errorMessage: 'IRS API integration not yet configured. Please verify charity manually.',
      warnings: [
        'IRS Pub 78 API integration requires configuration',
        'Visit https://www.irs.gov/charities-non-profits/tax-exempt-organization-search',
      ],
    };

    return mockVerification;
  } catch (error: any) {
    return {
      isVerified: false,
      verificationMethod: 'not_verified',
      errorMessage: `Verification failed: ${error.message}`,
    };
  }
}

/**
 * Verify charity using cached database (for performance)
 *
 * This would query your own database of previously verified charities
 */
export async function verifyCharityFromCache(
  ein: string
): Promise<CharityVerificationResult | null> {
  // In production, query your database for cached verification
  // For now, return null to indicate not in cache
  return null;
}

/**
 * Manual verification record
 *
 * Allows users to manually confirm a charity's status after verifying through IRS.gov
 */
export function createManualVerification(
  ein: string,
  name: string,
  deductibilityStatus: '501c3_public' | '501c3_private_foundation' | 'other',
  verifiedBy: string
): CharityVerificationResult {
  return {
    isVerified: true,
    ein,
    name,
    deductibilityStatus,
    verificationMethod: 'manual',
    verifiedAt: new Date().toISOString(),
    warnings: [
      `Manually verified by ${verifiedBy}`,
      'User should verify at https://www.irs.gov/charities-non-profits/tax-exempt-organization-search',
    ],
  };
}

/**
 * Validate EIN format
 */
export function isValidEIN(ein: string): boolean {
  // EIN format: XX-XXXXXXX (9 digits with hyphen after 2nd digit)
  const einRegex = /^\d{2}-\d{7}$/;
  return einRegex.test(ein);
}

/**
 * Format EIN to standard format (XX-XXXXXXX)
 */
export function formatEIN(ein: string): string {
  // Remove all non-digits
  const digitsOnly = ein.replace(/\D/g, '');

  if (digitsOnly.length !== 9) {
    throw new Error('EIN must be 9 digits');
  }

  return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
}

/**
 * Get deductibility limits based on organization type
 */
export function getDeductibilityLimits(
  recipientType: '501c3_public' | '501c3_private_foundation' | 'daf' | 'other',
  contributionType: 'cash' | 'appreciated_property'
): {
  agiLimitPercentage: number;
  description: string;
} {
  if (recipientType === '501c3_public' || recipientType === 'daf') {
    if (contributionType === 'cash') {
      return {
        agiLimitPercentage: 60,
        description: 'Cash to public charity or DAF: 60% of AGI',
      };
    } else {
      return {
        agiLimitPercentage: 30,
        description: 'Appreciated property to public charity: 30% of AGI',
      };
    }
  } else if (recipientType === '501c3_private_foundation') {
    if (contributionType === 'cash') {
      return {
        agiLimitPercentage: 30,
        description: 'Cash to private foundation: 30% of AGI',
      };
    } else {
      return {
        agiLimitPercentage: 20,
        description: 'Appreciated property to private foundation: 20% of AGI (at cost basis)',
      };
    }
  } else {
    return {
      agiLimitPercentage: 50,
      description: 'Other qualified organizations: typically 50% of AGI',
    };
  }
}

/**
 * Comprehensive charity verification workflow
 */
export async function verifyCharity(
  params: IRSPub78SearchParams
): Promise<CharityVerificationResult> {
  // Step 1: Check cache first (fastest)
  if (params.ein) {
    const cached = await verifyCharityFromCache(params.ein);
    if (cached) {
      return { ...cached, verificationMethod: 'cached' };
    }
  }

  // Step 2: Try IRS API
  const irsResult = await verifyCharityWithIRS(params);

  return irsResult;
}

/**
 * Batch verification for multiple charities
 */
export async function verifyCharitiesBatch(
  eins: string[]
): Promise<Record<string, CharityVerificationResult>> {
  const results: Record<string, CharityVerificationResult> = {};

  for (const ein of eins) {
    results[ein] = await verifyCharity({ ein });
  }

  return results;
}

/**
 * Helper: Generate IRS.gov search URL for manual verification
 */
export function getIRSSearchURL(params: IRSPub78SearchParams): string {
  const baseURL = 'https://www.irs.gov/charities-non-profits/tax-exempt-organization-search';

  if (params.ein) {
    // Search by EIN
    return `${baseURL}?ein=${encodeURIComponent(params.ein.replace('-', ''))}`;
  } else if (params.name) {
    // Search by name
    return `${baseURL}?name=${encodeURIComponent(params.name)}`;
  }

  return baseURL;
}

/**
 * Common charity warnings based on type
 */
export function getCharityWarnings(
  recipientType: '501c3_public' | '501c3_private_foundation' | 'daf' | 'other'
): string[] {
  const warnings: string[] = [];

  switch (recipientType) {
    case '501c3_private_foundation':
      warnings.push('Private foundations have lower AGI limits (30% cash, 20% property)');
      warnings.push('Appreciated property donations limited to cost basis for private foundations');
      break;

    case 'daf':
      warnings.push('DAF contributions cannot be used for QCDs');
      warnings.push('Must donate to the DAF sponsor (e.g., Fidelity Charitable), not final charity');
      break;

    case 'other':
      warnings.push('Verify this organization is IRS-qualified for tax deductions');
      warnings.push('Some organizations (e.g., 501c4, 501c6) do not qualify for charitable deductions');
      break;
  }

  return warnings;
}

/**
 * Validate charity for specific donation types
 */
export function validateCharityForDonationType(
  recipientType: '501c3_public' | '501c3_private_foundation' | 'daf' | 'other',
  donationType: 'qcd' | 'conservation_easement' | 'artwork' | 'standard'
): {
  valid: boolean;
  reason?: string;
} {
  switch (donationType) {
    case 'qcd':
      if (recipientType === 'daf') {
        return {
          valid: false,
          reason: 'QCDs cannot go to Donor Advised Funds',
        };
      }
      if (recipientType === '501c3_private_foundation') {
        return {
          valid: false,
          reason: 'QCDs cannot go to private foundations (with some exceptions for family foundations)',
        };
      }
      break;

    case 'conservation_easement':
      if (recipientType !== '501c3_public') {
        return {
          valid: false,
          reason: 'Conservation easements must go to qualified land trusts or public charities',
        };
      }
      break;
  }

  return { valid: true };
}
