export type OrgType = 'private_foundation' | 'daf' | 'community_foundation' | 'family_office' | 'operating_nonprofit' | 'other';
export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

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
