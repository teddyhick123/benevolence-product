/**
 * CPA Collaboration Portal
 *
 * Enables secure sharing of tax data with CPAs and tax professionals:
 * - Generate shareable links with expiration
 * - Control access to specific tax years and data
 * - Track CPA access and downloads
 * - Revoke access when needed
 */

import crypto from 'crypto';
import { branding } from '../config';

export interface CPAShareLink {
  id: string;
  portfolio_id: string;
  share_token?: string; // Stored SHA-256 token hash; raw bearer token is shown only at creation
  cpa_name?: string;
  cpa_email?: string;
  cpa_firm?: string;

  // Access control
  tax_years: number[]; // Which years to share
  expires_at?: string; // ISO date string
  max_accesses?: number; // Limit number of views
  access_count: number;

  // Permissions
  permissions: {
    view_contributions: boolean;
    view_carryforwards: boolean;
    view_donor_profile: boolean;
    view_tax_summary: boolean;
    view_documents?: boolean;
    download_form8283: boolean;
    download_turbotax: boolean;
  };

  // Metadata
  created_at: string;
  last_accessed_at?: string;
  revoked_at?: string;
  notes?: string;
}

export interface CPAAccessLog {
  id: string;
  share_link_id: string;
  created_at: string;
  ip_address?: string;
  user_agent?: string;
  action: 'view' | 'download_form8283' | 'download_turbotax' | 'download_csv';
  resource?: string;
}

/**
 * Generate a secure share token
 */
export function generateShareToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a raw CPA bearer token before persistence.
 */
export function hashShareToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Generate shareable URL for CPA access
 */
export function generateCPAShareURL(shareToken: string, baseURL?: string): string {
  const base = baseURL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error('NEXT_PUBLIC_APP_URL env var is required');
  return `${base}/tax/cpa/${shareToken}`;
}

/**
 * Validate share link access
 */
export function validateShareLink(link: CPAShareLink): {
  valid: boolean;
  reason?: string;
} {
  // Check if revoked
  if (link.revoked_at) {
    return { valid: false, reason: 'This share link has been revoked by the portfolio owner.' };
  }

  // Check expiration
  if (link.expires_at) {
    const expiresAt = new Date(link.expires_at);
    if (expiresAt < new Date()) {
      return { valid: false, reason: 'This share link has expired.' };
    }
  }

  // Check max accesses
  if (link.max_accesses && link.access_count >= link.max_accesses) {
    return { valid: false, reason: 'This share link has reached its maximum number of accesses.' };
  }

  return { valid: true };
}

/**
 * Get expiration display text
 */
export function getExpirationDisplay(expiresAt?: string): string {
  if (!expiresAt) return 'Never';

  const expiration = new Date(expiresAt);
  const now = new Date();
  const diffMs = expiration.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'Expired';
  if (diffDays === 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  if (diffDays < 7) return `Expires in ${diffDays} days`;
  if (diffDays < 30) return `Expires in ${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 365) return `Expires in ${Math.floor(diffDays / 30)} months`;
  return `Expires on ${expiration.toLocaleDateString()}`;
}

/**
 * Create default permissions (safe defaults)
 */
export function createDefaultPermissions(): CPAShareLink['permissions'] {
  return {
    view_contributions: true,
    view_carryforwards: true,
    view_donor_profile: false, // DOB is sensitive
    view_tax_summary: true,
    view_documents: false,
    download_form8283: true,
    download_turbotax: true,
  };
}

/**
 * Create expiration date from duration
 */
export function createExpirationDate(duration: '7days' | '30days' | '90days' | '1year' | 'never'): string | undefined {
  if (duration === 'never') return undefined;

  const now = new Date();

  switch (duration) {
    case '7days':
      now.setDate(now.getDate() + 7);
      break;
    case '30days':
      now.setDate(now.getDate() + 30);
      break;
    case '90days':
      now.setDate(now.getDate() + 90);
      break;
    case '1year':
      now.setFullYear(now.getFullYear() + 1);
      break;
  }

  return now.toISOString();
}

/**
 * Format CPA share link for email
 */
export function formatCPAEmailInvite(link: CPAShareLink, shareURL: string): {
  subject: string;
  body: string;
} {
  const expirationText = getExpirationDisplay(link.expires_at);

  const subject = 'Tax Data Shared - Charitable Contributions';

  const body = `Hi ${link.cpa_name || 'there'},

You've been granted access to view charitable contribution tax data.

**Access Details:**
- Tax Years: ${link.tax_years.join(', ')}
- Expiration: ${expirationText}
- Firm: ${link.cpa_firm || 'N/A'}

**Access Link:**
${shareURL}

**Available Data:**
${link.permissions.view_contributions ? '✓ Contribution details' : '✗ Contribution details'}
${link.permissions.view_carryforwards ? '✓ Carryforward schedules' : '✗ Carryforward schedules'}
${link.permissions.view_tax_summary ? '✓ Tax summary' : '✗ Tax summary'}
${link.permissions.view_documents ? '✓ Tax documents' : '✗ Tax documents'}
${link.permissions.download_form8283 ? '✓ Form 8283 PDF' : '✗ Form 8283 PDF'}
${link.permissions.download_turbotax ? '✓ TurboTax (TXF) export' : '✗ TurboTax (TXF) export'}

This link is secure and can only be accessed by you. If you have any questions, please contact the portfolio owner.

Best regards,
${branding.appName}`;

  return { subject, body };
}

/**
 * Log CPA access
 */
export function createAccessLog(
  shareLinkId: string,
  action: CPAAccessLog['action'],
  resource?: string,
  ipAddress?: string,
  userAgent?: string
): Omit<CPAAccessLog, 'id'> {
  return {
    share_link_id: shareLinkId,
    created_at: new Date().toISOString(),
    ip_address: ipAddress,
    user_agent: userAgent,
    action,
    resource,
  };
}
