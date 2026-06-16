export const WALKTHROUGH_PASSWORD = 'Walkthrough123!';

export const personas = {
  appAdmin: {
    email: 'app-admin@walkthrough.local',
    fullName: 'Avery App Admin',
  },
  orgOwner: {
    email: 'org-owner@walkthrough.local',
    fullName: 'Olivia Org Owner',
  },
  orgAdmin: {
    email: 'org-admin@walkthrough.local',
    fullName: 'Amelia Org Admin',
  },
  member: {
    email: 'member@walkthrough.local',
    fullName: 'Morgan Member',
  },
  viewer: {
    email: 'viewer@walkthrough.local',
    fullName: 'Victor Viewer',
  },
  multiOrgMember: {
    email: 'multi-org@walkthrough.local',
    fullName: 'Mina Multi Org',
  },
  newUser: {
    email: 'new-user@walkthrough.local',
    fullName: 'Nora New User',
  },
  outsider: {
    email: 'outsider@walkthrough.local',
    fullName: 'Oscar Outsider',
  },
} as const;

export type PersonaName = keyof typeof personas;

export const fixtureIds = {
  orgs: {
    alpha: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    beta: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    gamma: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  },
  portfolios: {
    alpha: 'aaaaaaaa-0000-4000-8000-000000000001',
    beta: 'bbbbbbbb-0000-4000-8000-000000000001',
    gamma: 'cccccccc-0000-4000-8000-000000000001',
  },
  holdings: {
    alphaGrant: 'aaaaaaaa-1000-4000-8000-000000000001',
    gammaGrant: 'cccccccc-1000-4000-8000-000000000001',
  },
  grants: {
    alphaDraft: 'aaaaaaaa-2000-4000-8000-000000000001',
  },
} as const;
