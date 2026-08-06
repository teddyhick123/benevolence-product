// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Phase 5 canonical schema alignment', () => {
  const holdings = read('db/migrations/0006_holdings.sql');
  const metrics = read('db/migrations/0008_metrics_and_kpis.sql');
  const charities = read('db/migrations/0010_charities_and_news.sql');
  const reports = read('db/migrations/0011_reports.sql');
  const tax = read('db/migrations/0013_tax_contributions.sql');
  const donors = read('db/migrations/0014_donors.sql');
  const acknowledgments = read('db/migrations/0015_acknowledgments.sql');
  const analytics = read('db/migrations/0035_analytics_module.sql');
  const portfolios = read('db/migrations/0004_portfolios.sql');

  it('owns holding narratives and contacts without embedded contact columns', () => {
    expect(holdings).toMatch(/theory_of_action\s+text/i);
    expect(holdings).toMatch(/CREATE TABLE IF NOT EXISTS holding_contacts/i);
    expect(holdings).toMatch(/CREATE UNIQUE INDEX idx_holding_contacts_one_primary[\s\S]*WHERE is_primary/i);
    expect(holdings).toMatch(/holding_contacts[\s\S]*can_view_portfolio/i);
    expect(holdings).toMatch(/VALUES \(\s*'holding-contact-photos',\s*'holding-contact-photos',\s*false/i);
    expect(holdings).not.toMatch(/primary_contact_(name|email|phone|photo|notes)\s+text/i);
  });

  it('uses the canonical holding → investee → charity relationship', () => {
    expect(charities).toMatch(/holdings_investee_id_fkey[\s\S]*FOREIGN KEY \(investee_id\)[\s\S]*REFERENCES investees\(id\)/i);
    expect(read('app/api/holdings/[id]/link-charity/route.ts')).toContain('createHoldingCharityRepository');
    expect(read('lib/api/repositories/holding-charities.ts')).toContain('.update({ investee_id: investeeId })');
  });

  it('defines security-invoker KPI reads and scoped repository aggregates', () => {
    expect(metrics).toMatch(/VIEW v_portfolio_kpi_latest\s+WITH \(security_invoker = true\)/i);
    expect(metrics).toMatch(/VIEW v_portfolio_kpi_series\s+WITH \(security_invoker = true\)/i);
    expect(read('app/dashboard/page.tsx')).toContain('metricsRepository.latestSums()');
    expect(read('app/api/portfolio/[id]/map/route.ts')).toContain('.topByHolding(holdingIds, 3)');
  });

  it('persists risk snapshots atomically and checks edit access', () => {
    const fn = analytics.match(/CREATE OR REPLACE FUNCTION public\.generate_risk_snapshot[\s\S]*?\$\$;/i)?.[0] ?? '';
    expect(fn).toContain('public.can_edit_portfolio(p_portfolio_id)');
    expect(fn).toContain('ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE');
    expect(fn).toContain('RETURNING id INTO v_snapshot_id');
    expect(analytics).toMatch(/REVOKE ALL ON FUNCTION public\.generate_risk_snapshot\(UUID\) FROM PUBLIC/i);
  });

  it('derives donations through holding_contributions and a security-invoker summary', () => {
    const route = read('app/api/portfolio/[id]/donations/route.ts');
    expect(route).toContain('holding_contributions(tax_contribution_id, tax_contributions(*))');
    expect(route).not.toContain("select('*, tax_contributions(*)'");
    expect(tax).toMatch(/VIEW public\.v_portfolio_donation_summary\s+WITH \(security_invoker = true\)/i);
    expect(tax).toMatch(/JOIN public\.tax_contributions tc ON tc\.id = hc\.tax_contribution_id/i);
  });

  it('stores versioned letters in generated_documents', () => {
    expect(reports).toMatch(/document_type IN \('report', 'export', 'letter'\)/i);
    expect(reports).toMatch(/version\s+integer NOT NULL DEFAULT 1 CHECK \(version > 0\)/i);
    expect(reports).toMatch(/uq_generated_documents_letter_version[\s\S]*WHERE document_type = 'letter'/i);
    expect(read('app/api/portfolio/[id]/letter/generate/route.ts')).toContain('createGeneratedDocumentsRepository');
  });

  it('stores shared CRM semantics while keeping contribution aliases out of DDL', () => {
    expect(donors).toMatch(/contact_name\s+text/i);
    expect(donors).toMatch(/is_anonymous\s+boolean NOT NULL DEFAULT false/i);
    expect(donors).toMatch(/communication_preference\s+text NOT NULL DEFAULT 'email'/i);
    expect(donors).toMatch(/do_not_contact\s+boolean NOT NULL DEFAULT false/i);
    expect(donors).not.toMatch(/postal_code\s+text/i);
    expect(donors).not.toMatch(/acknowledgment_status\s+text/i);
    expect(acknowledgments).toMatch(/letter_type\s+text NOT NULL DEFAULT 'general'/i);
    expect(acknowledgments).toMatch(/contribution_ids\s+uuid\[\]/i);
  });

  it('serializes last-owner mutations inside the database', () => {
    const fn = portfolios.match(/CREATE OR REPLACE FUNCTION mutate_portfolio_member[\s\S]*?\$\$;/i)?.[0] ?? '';
    expect(fn).toContain('pg_advisory_xact_lock');
    expect(fn).toContain("role = 'owner'");
    expect(fn).toContain('v_owner_count <= 1');
    expect(read('app/api/admin/portfolios/[id]/members/[userId]/route.ts')).toContain('createPortfolioMembershipRepository');
  });

  it('does not recreate retired generic infrastructure', () => {
    const sources = [
      read('app/profile/page.tsx'),
      read('app/api/admin/demo/load/route.ts'),
      read('app/api/admin/portfolios/[id]/members/[userId]/route.ts'),
      read('app/api/portfolio/[id]/letter/generate/route.ts'),
    ].join('\n');
    expect(sources).not.toMatch(/generated_letters|\.from\('admins'\)|exec_sql|owner_count_for_portfolio/);
    expect(read('app/api/admin/demo/load/route.ts')).toContain('createDemoSeedingRepository');
  });

  it('keeps every schema-variable relation behind the import allowlist', () => {
    const adapter = read('lib/import/database.ts');
    expect(adapter).toContain('IMPORT_STAGING_RELATIONS');
    expect(adapter).toContain('IMPORT_TARGET_RELATIONS');
    expect(adapter).toContain('Import relation is not allowed');

    const importSources = [
      'reconciler.ts',
      'rollback.ts',
      'csv-extractor.ts',
      'etl-runner.ts',
      'loader.ts',
    ].map(file => read(`lib/import/${file}`)).join('\n');
    expect(importSources).not.toMatch(/\.from\((stagingTable|tableName)\)/);

    const importRoutes = [
      'app/admin/imports/[id]/mapping/page.tsx',
      'app/api/admin/import/ai/suggest/route.ts',
      'app/api/admin/imports/[id]/route.ts',
      'app/api/org/[orgId]/imports/[jobId]/route.ts',
    ].map(read).join('\n');
    expect(importRoutes).not.toMatch(/\.from\((table|staging_table)\)/);
    expect(importRoutes).toContain('fromImportRelation');

    const aiActions = read('lib/ai-action-executor.ts');
    expect(aiActions).not.toContain('.from(opData.table)');
    expect(aiActions).toContain('AI action relation is not reversible');
  });

  it('preserves durable AI messages and request idempotency', () => {
    const ai = read('db/migrations/0033_ai_sessions.sql');
    expect(ai).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_turns/i);
    expect(ai).toMatch(/UNIQUE \(user_id, request_id\)/i);
    expect(ai).toMatch(/CREATE TABLE IF NOT EXISTS public\.ai_messages/i);
    expect(ai).toMatch(/UNIQUE \(turn_id, role\)/i);
    expect(ai).toContain('pg_advisory_xact_lock');
    expect(ai).toContain("IF v_turn.status = 'completed'");
  });
});
