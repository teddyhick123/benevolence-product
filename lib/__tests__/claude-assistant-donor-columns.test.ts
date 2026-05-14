import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('claude-assistant donor executor column contract', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('does not reference donor.donor_type (use is_organization)', () => {
    expect(src).not.toMatch(/donor\.donor_type/);
    expect(src).not.toMatch(/\bd\.donor_type\b/);
  });

  it('does not use postal_code (column is zip)', () => {
    expect(src).not.toContain('postal_code');
  });

  it('does not insert organization_id into acknowledgment_letters', () => {
    expect(src).not.toMatch(/organization_id:\s*(?:contribution|args)\.organization_id/);
  });

  it('search_donors filters v_donor_summary by org_id not organization_id', () => {
    expect(src).not.toMatch(/eq\(['"]organization_id['"],\s*args\.organization_id\)/);
  });

  it('search_donors filters by tier not donor_tier', () => {
    expect(src).not.toMatch(/eq\(['"]donor_tier['"]/);
  });

  it('writes canonical contributions_received columns', () => {
    const contributionInsert = src.match(/from\('contributions_received'\)[\s\S]{0,500}\.insert\(\{([\s\S]{0,900}?)\}\)/)?.[1] ?? '';

    expect(contributionInsert).toContain('gift_type:');
    expect(contributionInsert).toContain('fund_designation:');
    expect(contributionInsert).not.toContain('contribution_type:');
    expect(contributionInsert).not.toMatch(/^\s*designation:/m);
    expect(contributionInsert).not.toContain('created_by:');
  });

  it('does not select or update nonexistent contribution status aliases', () => {
    expect(src).not.toMatch(/select\(['"`][^'"`]*\bcontribution_type\b/);
    expect(src).not.toMatch(/select\(['"`][^'"`]*\bdesignation\b/);
    expect(src).not.toMatch(/select\(['"`][^'"`]*\bis_tax_deductible\b/);
    expect(src).not.toMatch(/acknowledgment_status/);
  });

  it('uses active v_donor_summary identifiers', () => {
    const donorSummaryQuery = src.match(/from\('v_donor_summary'\)[\s\S]{0,160}\.single\(\)/)?.[0] ?? '';
    expect(donorSummaryQuery).toMatch(/eq\(['"]id['"],\s*args\.donor_id\)/);
    expect(donorSummaryQuery).not.toMatch(/eq\(['"]donor_id['"],\s*args\.donor_id\)/);
    expect(src).not.toMatch(/\bd\.donor_id\b/);
    expect(src).not.toMatch(/\bd\.donor_tier\b/);
    expect(src).not.toMatch(/eq\(['"]has_pending_receipts['"]/);
  });

  it('writes canonical acknowledgment_letters columns', () => {
    expect(src).not.toMatch(/from\('acknowledgment_letters'\)[\s\S]{0,900}letter_type:/);
    expect(src).not.toMatch(/from\('acknowledgment_letters'\)[\s\S]{0,900}contribution_id:/);
    expect(src).not.toMatch(/from\('acknowledgment_letters'\)[\s\S]{0,900}sent_via:/);
    expect(src).not.toMatch(/from\('acknowledgment_letters'\)[\s\S]{0,900}created_by:/);
    expect(src).toMatch(/contribution_ids:/);
    expect(src).toMatch(/delivery_method:/);
  });
});
