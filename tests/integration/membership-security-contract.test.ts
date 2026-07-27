// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'db', 'migrations', name), 'utf8');

const organizationsSql = migration('0002_organizations.sql');
const portfoliosSql = migration('0004_portfolios.sql');
const provisioningSql = migration('0023_admin_superuser_policies.sql');
const orgRoute = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'org', 'route.ts'), 'utf8');
const invitationAcceptRoute = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'invitations', '[token]', 'accept', 'route.ts'),
  'utf8'
);

function functionDefinition(sql: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION\\s+${escaped}\\s*\\([^)]*\\)[\\s\\S]*?\\$\\$;`,
    'i'
  ));
  if (!match) throw new Error(`Missing canonical function ${name}`);
  return match[0];
}

describe('accepted organization membership security boundary', () => {
  it.each(['org_role_gte', 'user_org_role'])(
    '%s rejects pending organization memberships',
    (name) => {
      const definition = functionDefinition(organizationsSql, name);
      expect(definition).toMatch(/om\.accepted_at\s+IS\s+NOT\s+NULL/i);
      expect(definition).toMatch(/om\.deleted_at\s+IS\s+NULL/i);
    }
  );

  it.each(['user_portfolio_role', 'can_view_portfolio', 'can_edit_portfolio'])(
    '%s requires an active accepted org membership for the portfolio owner org',
    (name) => {
      const definition = functionDefinition(portfoliosSql, name);
      expect(definition).toMatch(/JOIN\s+portfolios\s+p\s+ON\s+p\.id\s*=\s*pm\.portfolio_id/i);
      expect(definition).toMatch(/JOIN\s+organization_members\s+om/i);
      expect(definition).toMatch(/om\.org_id\s*=\s*p\.org_id/i);
      expect(definition).toMatch(/om\.user_id\s*=\s*pm\.user_id/i);
      expect(definition).toMatch(/om\.accepted_at\s+IS\s+NOT\s+NULL/i);
      expect(definition).toMatch(/om\.deleted_at\s+IS\s+NULL/i);
    }
  );

  it('prevents creating portfolio membership for a pending org member', () => {
    const definition = functionDefinition(portfoliosSql, 'enforce_portfolio_member_in_org');
    expect(definition).toMatch(/accepted_at\s+IS\s+NOT\s+NULL/i);
    expect(definition).toMatch(/deleted_at\s+IS\s+NULL/i);
  });

  it('marks every directly provisioned owner membership as accepted', () => {
    expect(provisioningSql).toMatch(
      /INSERT INTO organization_members\s*\(org_id, user_id, role, accepted_at\)[\s\S]*?now\(\)/i
    );
    expect(orgRoute).toMatch(
      /from\('organization_members'\)[\s\S]*?insert\(\{[\s\S]*?accepted_at:\s*new Date\(\)\.toISOString\(\)/
    );
  });

  it('marks new and pre-existing pending invitation memberships as accepted', () => {
    expect(invitationAcceptRoute).toContain(".select('id, accepted_at')");
    expect(invitationAcceptRoute).toMatch(
      /from\('organization_members'\)[\s\S]*?update\(\{ accepted_at: new Date\(\)\.toISOString\(\) \}\)/
    );
    expect(invitationAcceptRoute).toMatch(
      /from\('organization_members'\)[\s\S]*?insert\(\{[\s\S]*?accepted_at:\s*new Date\(\)\.toISOString\(\)/
    );
  });
});
