import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

const COLD_APP_TIMEOUT = 180_000;

test.setTimeout(600_000);

async function deleteGrantByHoldingName(adminDb: any, holdingName: string) {
  const { data: holdings } = await adminDb
    .from('holdings')
    .select('id, investee_id')
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('name', holdingName);

  const holdingIds = (holdings ?? []).map((holding: { id: string }) => holding.id);
  const investeeIds = (holdings ?? [])
    .map((holding: { investee_id: string | null }) => holding.investee_id)
    .filter(Boolean);

  if (holdingIds.length > 0) {
    const { data: grants } = await adminDb
      .from('grants')
      .select('id')
      .in('holding_id', holdingIds);
    const grantIds = (grants ?? []).map((grant: { id: string }) => grant.id);

    if (grantIds.length > 0) {
      await adminDb.from('grant_decisions').delete().in('grant_id', grantIds);
      await adminDb.from('grant_status_history').delete().in('grant_id', grantIds);
      await adminDb.from('grant_payments').delete().in('grant_id', grantIds);
      await adminDb.from('grant_reports').delete().in('grant_id', grantIds);
      await adminDb.from('grant_milestones').delete().in('grant_id', grantIds);
      await adminDb.from('grants').delete().in('id', grantIds);
    }

    await adminDb.from('holdings').delete().in('id', holdingIds);
  }

  if (investeeIds.length > 0) {
    await adminDb.from('investees').delete().in('id', investeeIds);
  }
}

async function deletePledgeByDonorEmail(adminDb: any, email: string) {
  const { data: donors } = await adminDb
    .from('donors')
    .select('id')
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('email', email);

  const donorIds = (donors ?? []).map((donor: { id: string }) => donor.id);
  if (donorIds.length === 0) return;

  const { data: pledges } = await adminDb
    .from('pledges')
    .select('id')
    .eq('org_id', fixtureIds.orgs.alpha)
    .in('donor_id', donorIds);
  const pledgeIds = (pledges ?? []).map((pledge: { id: string }) => pledge.id);

  if (pledgeIds.length > 0) {
    const { data: installments } = await adminDb
      .from('pledge_installments')
      .select('id, contribution_id')
      .in('pledge_id', pledgeIds);
    const contributionIds = (installments ?? [])
      .map((installment: { contribution_id: string | null }) => installment.contribution_id)
      .filter(Boolean);

    await adminDb.from('pledge_events').delete().in('pledge_id', pledgeIds);
    await adminDb.from('pledge_installments').delete().in('pledge_id', pledgeIds);
    await adminDb.from('pledges').delete().in('id', pledgeIds);

    if (contributionIds.length > 0) {
      await adminDb.from('acknowledgment_letters').delete().contains('contribution_ids', contributionIds);
      await adminDb.from('contributions_received').delete().in('id', contributionIds);
    }
  }

  await adminDb.from('acknowledgment_letters').delete().in('donor_id', donorIds);
  await adminDb.from('contributions_received').delete().in('donor_id', donorIds);
  await adminDb.from('donors').delete().in('id', donorIds);
}

async function createPledgeDonor(adminDb: any, email: string) {
  const { data, error } = await adminDb
    .from('donors')
    .insert({
      org_id: fixtureIds.orgs.alpha,
      first_name: 'Deep',
      last_name: 'Pledger',
      email,
      tier: 'major',
      notes: 'Created by the deep pledge exploratory walkthrough setup.',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

test('deep grant journey: creates a grant from the visible wizard and opens its workspace', async ({ page, adminDb }) => {
  const granteeName = 'Deep Grant Walkthrough Org';
  const purpose = 'Created by the deep grant exploratory walkthrough.';

  await deleteGrantByHoldingName(adminDb, granteeName);
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto('/dashboard/grants', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Grant Management' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: 'New Grant' }).click();
    await expect(page.getByRole('heading', { name: 'New Grant' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.locator('input[placeholder="e.g. Community Health Foundation"]').fill(granteeName);
    await page.locator('input[placeholder="12-3456789"]').fill('98-7654321');
    await page.locator('input[placeholder="e.g. Health"]').fill('Education');
    await page.locator('input[placeholder="e.g. San Francisco"]').fill('Portland');
    await page.locator('input[placeholder="US"]').fill('US');
    await page.getByRole('button', { name: 'Continue →' }).click();

    await page.locator("textarea[placeholder=\"Describe the grant's purpose and intended impact\"]").fill(purpose);
    await page.locator('input[placeholder="100000"]').fill('42500');
    await page.locator('input[placeholder="e.g. Program, Capital"]').fill('Program');
    await page.getByRole('combobox').nth(1).selectOption('medium');
    await page.locator('input[type="date"]').nth(0).fill('2026-07-01');
    await page.locator('input[type="date"]').nth(1).fill('2027-06-30');
    await page.getByRole('combobox').nth(2).selectOption('prospect');
    await page.getByRole('button', { name: 'Continue →' }).click();

    const createGrantResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/org/${fixtureIds.orgs.alpha}/grants`) &&
      response.request().method() === 'POST',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Create Grant' }).click();
    const createGrantResponse = await createGrantResponsePromise;
    expect(createGrantResponse.status()).toBe(201);

    await page.waitForURL(url => /\/dashboard\/grants\/[^/]+$/.test(url.pathname), {
      timeout: COLD_APP_TIMEOUT,
    });
    await expect(page.getByRole('heading', { name: granteeName })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByText(purpose)).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: grant } = await adminDb
      .from('grants')
      .select('id, org_id, portfolio_id, lifecycle_stage, requested_amount, grant_type, risk_level, holdings!inner(name, ein, city, country)')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('holdings.name', granteeName)
      .single();

    expect(grant?.portfolio_id).toBe(fixtureIds.portfolios.alpha);
    expect(grant?.lifecycle_stage).toBe('prospect');
    expect(Number(grant?.requested_amount)).toBe(42500);
    expect(grant?.grant_type).toBe('Program');
    expect(grant?.risk_level).toBe('medium');
    expect((grant?.holdings as any)?.ein).toBe('98-7654321');

    const { count: historyCount } = await adminDb
      .from('grant_status_history')
      .select('*', { count: 'exact', head: true })
      .eq('grant_id', grant!.id)
      .eq('to_stage', 'prospect');
    expect(historyCount).toBe(1);
  } finally {
    await deleteGrantByHoldingName(adminDb, granteeName);
  }
});

test('deep pledge journey: creates a pledge schedule and records an installment payment', async ({ page, adminDb }) => {
  const email = 'walkthrough.deep.pledger@example.org';
  const donorName = 'Deep Pledger';

  await deletePledgeByDonorEmail(adminDb, email);
  await createPledgeDonor(adminDb, email);
  await loginAs(page, 'orgAdmin');
  await setActiveOrg(page, fixtureIds.orgs.alpha);
  await page.waitForLoadState('networkidle', { timeout: COLD_APP_TIMEOUT }).catch(() => undefined);

  try {
    await page.goto('/dashboard/pledges', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Pledge Pipeline' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await expect(page.getByText('No pledges found')).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByRole('button', { name: 'Create first pledge' }).click();
    await expect(page.getByRole('heading', { name: /New Pledge/ })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByLabel('Donor search').fill(donorName);
    await page.getByRole('button', { name: donorName }).click();
    await page.locator('input[placeholder="0.00"]').fill('1200');
    await page.locator('textarea').fill('Created by the deep pledge exploratory walkthrough.');
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.locator('input[type="date"]').first().fill('2026-08-01');
    await page.locator('select').last().selectOption('monthly');
    await page.locator('input[type="number"]').last().fill('3');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByText('Sum: $1200.00 / $1200.00')).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.getByRole('button', { name: 'Continue' }).click();

    const createPledgeResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/org/${fixtureIds.orgs.alpha}/pledges`) &&
      response.request().method() === 'POST',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Create Pledge' }).click();
    const createPledgeResponse = await createPledgeResponsePromise;
    expect(createPledgeResponse.status()).toBe(201);

    await expect(page.getByRole('row', { name: /Deep Pledger/ })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: pledge } = await adminDb
      .from('pledges')
      .select('id, total_amount, frequency, commitment_type, status, notes')
      .eq('org_id', fixtureIds.orgs.alpha)
      .eq('notes', 'Created by the deep pledge exploratory walkthrough.')
      .single();
    expect(Number(pledge?.total_amount)).toBe(1200);
    expect(pledge?.frequency).toBe('monthly');
    expect(pledge?.commitment_type).toBe('written');
    expect(pledge?.status).toBe('active');

    const { data: installments } = await adminDb
      .from('pledge_installments')
      .select('id, amount, status, due_date')
      .eq('pledge_id', pledge!.id)
      .order('due_date');
    expect(installments).toHaveLength(3);
    expect(Number(installments?.[0]?.amount)).toBe(400);
    expect(installments?.[0]?.status).toBe('pending');

    await page.getByRole('row', { name: /Deep Pledger/ }).getByRole('button', { name: 'View' }).click();
    await expect(page.getByRole('dialog')).toContainText('Deep Pledger', { timeout: COLD_APP_TIMEOUT });
    await page.getByRole('button', { name: 'Record Payment' }).first().click();
    await page.locator('input[type="date"]').last().fill('2026-08-05');
    await page.getByRole('textbox').last().fill('DEEP-PLEDGE-PAY-001');
    const paymentResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/org/${fixtureIds.orgs.alpha}/pledges/${pledge!.id}/installments/`) &&
      response.request().method() === 'PATCH',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Confirm Payment' }).click();
    const paymentResponse = await paymentResponsePromise;
    expect(paymentResponse.status()).toBe(200);
    await expect(page.getByText('Ref: DEEP-PLEDGE-PAY-001')).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: paidInstallment } = await adminDb
      .from('pledge_installments')
      .select('status, paid_at, payment_ref, contribution_id')
      .eq('id', installments![0].id)
      .single();
    expect(paidInstallment?.status).toBe('paid');
    expect(paidInstallment?.payment_ref).toBe('DEEP-PLEDGE-PAY-001');
    expect(paidInstallment?.paid_at).not.toBeNull();
    expect(paidInstallment?.contribution_id).toBeTruthy();

    const { data: contribution } = await adminDb
      .from('contributions_received')
      .select('amount, gift_type, pledge_id, pledge_installment_id')
      .eq('id', paidInstallment!.contribution_id)
      .single();
    expect(Number(contribution?.amount)).toBe(400);
    expect(contribution?.gift_type).toBe('pledge');
    expect(contribution?.pledge_id).toBe(pledge!.id);
    expect(contribution?.pledge_installment_id).toBe(installments![0].id);
  } finally {
    await deletePledgeByDonorEmail(adminDb, email);
  }
});
