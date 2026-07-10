export type OrgType =
  | 'private_foundation'
  | 'family_office'
  | 'daf_sponsor'
  | 'community_foundation'
  | 'nonprofit'
  | 'corporation'
  | 'individual';
import type { OrgRole } from '@/lib/roles';
export type { OrgRole } from '@/lib/roles';

export interface OrgModules {
  portfolio: boolean;
  tax: boolean;
  grants: boolean;
  compliance: boolean;
  donors: boolean;
  quickbooks: boolean;
}

export interface OrgBranding {
  logo_url?: string;
  primary_color?: string;
}

export interface Organization {
  id: string;
  name: string;
  ein?: string;
  org_type?: OrgType;
  fiscal_year_end?: string;
  state_of_incorporation?: string;
  modules: OrgModules;
  branding: OrgBranding;
  created_at: string;
  updated_at: string;
  role?: OrgRole; // populated from join with organization_members
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export type DonorType = 'individual' | 'organization' | 'foundation' | 'estate' | 'trust';
export type DonorTier = 'major' | 'mid_major' | 'regular' | 'small' | 'prospect';
export type DonorRecencyStatus = 'new' | 'active' | 'lapsed' | 'lost' | 'prospect';

export interface Donor {
  id: string;
  organization_id: string;
  donor_type: DonorType;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  contact_name?: string;
  is_anonymous: boolean;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  donor_tier?: DonorTier;
  communication_preference?: 'email' | 'mail' | 'phone' | 'none';
  do_not_contact: boolean;
  tags: string[];
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // v_donor_summary computed fields
  display_name?: string;
  total_lifetime_giving?: number;
  total_gift_count?: number;
  last_gift_date?: string;
  first_gift_date?: string;
  pending_acknowledgments_count?: number;
  has_pending_acknowledgments?: boolean;
  recency_status?: DonorRecencyStatus;
  computed_tier?: DonorTier;
}

export type AcknowledgmentLetterType = 'year_end' | 'receipt' | 'qcd' | 'non_cash' | 'general';
export type AcknowledgmentLetterStatus = 'draft' | 'sent' | 'archived';

export interface AcknowledgmentLetter {
  id: string;
  organization_id: string;
  donor_id: string;
  contribution_id?: string;
  letter_type: AcknowledgmentLetterType;
  status: AcknowledgmentLetterStatus;
  subject?: string;
  body?: string;
  custom_message?: string;
  org_name?: string;
  org_ein?: string;
  sent_via?: 'email' | 'mail' | 'both';
  sent_at?: string;
  pdf_url?: string;
  pdf_storage_path?: string;
  tax_year?: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type FilingType = 'form_990pf' | 'form_990' | 'form_990ez' | 'state_registration' | 'state_filing' | 'form_8283' | 'other';
// Matches filing_calendar.status CHECK values in 0016_compliance.sql
export type FilingStatus = 'upcoming' | 'in_progress' | 'filed' | 'extended' | 'overdue' | 'waived' | 'not_applicable';

export interface FilingCalendarEntry {
  id: string;
  org_id: string;
  filing_type: FilingType;
  title: string;
  due_date: string;
  status: FilingStatus;
  description?: string;
  jurisdiction?: string;
  extension_due_date?: string;
  period_start?: string;
  period_end?: string;
  completed_at?: string;
  completed_by?: string;
  filing_reference?: string;
  notes?: string;
  reminder_days?: number[];
  is_recurring?: boolean;
  created_at: string;
  updated_at: string;
}

export interface StateRegistration {
  id: string;
  organization_id: string;
  state: string;
  registration_number?: string;
  registered_name?: string;
  registration_date?: string;
  expiration_date?: string;
  renewal_due_date?: string;
  status: FilingStatus;
  annual_report_due?: string;
  annual_report_filed?: string;
  filing_fee?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}
