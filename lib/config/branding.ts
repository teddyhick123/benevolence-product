/**
 * Branding Configuration
 *
 * Centralized branding settings for the platform.
 * Customize this file for each client instance.
 *
 * This is the SINGLE SOURCE OF TRUTH for all branding.
 */

export const branding = {
  /**
   * Application name - displayed in headers, titles, emails
   */
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Impact Platform',

  /**
   * Company/Organization name - for legal, footer, etc.
   */
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Impact Platform Inc.',

  /**
   * Tagline - short description
   */
  tagline: process.env.NEXT_PUBLIC_TAGLINE || 'Manage your impact portfolio',

  /**
   * Support email
   */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@example.com',

  /**
   * Logo paths (relative to /public)
   */
  logo: {
    /** Main logo (light backgrounds) */
    primary: process.env.NEXT_PUBLIC_LOGO_PRIMARY || '/logo.svg',
    /** Logo for dark backgrounds */
    light: process.env.NEXT_PUBLIC_LOGO_LIGHT || '/logo-light.svg',
    /** Small icon/favicon */
    icon: process.env.NEXT_PUBLIC_LOGO_ICON || '/icon.svg',
  },

  /**
   * Brand colors
   * These should match tailwind.config.js
   */
  colors: {
    /** Primary brand color */
    primary: process.env.NEXT_PUBLIC_COLOR_PRIMARY || '#5186a6',
    /** Secondary/accent color */
    secondary: process.env.NEXT_PUBLIC_COLOR_SECONDARY || '#e07a5f',
    /** Background color */
    background: process.env.NEXT_PUBLIC_COLOR_BACKGROUND || '#fffff9',
    /** Text color */
    text: process.env.NEXT_PUBLIC_COLOR_TEXT || '#0f172a',
  },

  /**
   * Social links (optional)
   */
  social: {
    twitter: process.env.NEXT_PUBLIC_SOCIAL_TWITTER || '',
    linkedin: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN || '',
    website: process.env.NEXT_PUBLIC_SOCIAL_WEBSITE || '',
  },

  /**
   * Legal
   */
  legal: {
    privacyUrl: process.env.NEXT_PUBLIC_PRIVACY_URL || '/privacy',
    termsUrl: process.env.NEXT_PUBLIC_TERMS_URL || '/terms',
  },

  /**
   * AI Assistant personality name
   */
  assistantName: process.env.NEXT_PUBLIC_ASSISTANT_NAME || 'Assistant',

  /**
   * Onboarding assistant personality name
   */
  onboardingAssistantName: process.env.NEXT_PUBLIC_ONBOARDING_ASSISTANT_NAME || 'Foundation Setup',
} as const;

/**
 * Type for branding config
 */
export type BrandingConfig = typeof branding;

/**
 * Helper to get full app title
 */
export function getPageTitle(pageTitle?: string): string {
  if (!pageTitle) return branding.appName;
  return `${pageTitle} | ${branding.appName}`;
}

/**
 * Helper to get meta description
 */
export function getMetaDescription(custom?: string): string {
  return custom || `${branding.appName} - ${branding.tagline}`;
}
