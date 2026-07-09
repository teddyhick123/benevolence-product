import { test, expect, loginAs, setActiveOrg } from '../fixtures';
import { fixtureIds } from '../personas';

const COLD_APP_TIMEOUT = 180_000;
const ANALYTICS_METRIC = 'DEEP_WALKTHROUGH_IMPACT';

test.setTimeout(600_000);

async function deleteReportArtifacts(adminDb: any, title: string) {
  const { data: templates } = await adminDb
    .from('report_templates')
    .select('id')
    .eq('portfolio_id', fixtureIds.portfolios.alpha)
    .eq('name', title);

  const templateIds = (templates ?? []).map((template: { id: string }) => template.id);

  await adminDb
    .from('generated_documents')
    .delete()
    .eq('portfolio_id', fixtureIds.portfolios.alpha)
    .eq('title', title);

  if (templateIds.length > 0) {
    await adminDb.from('generated_documents').delete().in('template_id', templateIds);
    await adminDb.from('report_templates').delete().in('id', templateIds);
  }
}

async function seedAnalyticsFacts(adminDb: any) {
  await adminDb
    .from('metric_projections_cache')
    .delete()
    .eq('portfolio_id', fixtureIds.portfolios.alpha)
    .eq('metric_code', ANALYTICS_METRIC);

  await adminDb
    .from('metric_facts')
    .delete()
    .eq('holding_id', fixtureIds.holdings.alphaGrant)
    .eq('metric_code', ANALYTICS_METRIC);

  const { error: metricError } = await adminDb
    .from('metrics')
    .upsert({
      code: ANALYTICS_METRIC,
      name: 'Deep Walkthrough Impact',
      unit: 'score',
      description: 'Metric seeded by the deep analytics walkthrough.',
    }, { onConflict: 'code' });
  if (metricError) throw metricError;

  const rows = [
    { period_start: '2025-01-01', period_end: '2025-03-31', value: 100 },
    { period_start: '2025-04-01', period_end: '2025-06-30', value: 135 },
    { period_start: '2025-07-01', period_end: '2025-09-30', value: 175 },
    { period_start: '2025-10-01', period_end: '2025-12-31', value: 220 },
  ].map(row => ({
    holding_id: fixtureIds.holdings.alphaGrant,
    metric_code: ANALYTICS_METRIC,
    unit: 'score',
    source: 'deep_walkthrough',
    submitted_by_org_id: fixtureIds.orgs.alpha,
    ...row,
  }));

  const { error } = await adminDb.from('metric_facts').insert(rows);
  if (error) throw error;
}

async function cleanupAnalyticsFacts(adminDb: any) {
  await adminDb
    .from('metric_projections_cache')
    .delete()
    .eq('portfolio_id', fixtureIds.portfolios.alpha)
    .eq('metric_code', ANALYTICS_METRIC);

  await adminDb
    .from('metric_facts')
    .delete()
    .eq('holding_id', fixtureIds.holdings.alphaGrant)
    .eq('metric_code', ANALYTICS_METRIC);

  await adminDb
    .from('metrics')
    .delete()
    .eq('code', ANALYTICS_METRIC);
}

async function deleteFilingByTitle(adminDb: any, title: string) {
  const { data: filings } = await adminDb
    .from('filing_calendar')
    .select('id, attachments')
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('title', title);

  for (const filing of filings ?? []) {
    const paths = ((filing.attachments ?? []) as Array<{ path?: string }>)
      .map(attachment => attachment.path)
      .filter(Boolean);
    if (paths.length > 0) {
      await adminDb.storage.from('compliance-documents').remove(paths);
    }
  }

  await adminDb
    .from('filing_calendar')
    .delete()
    .eq('org_id', fixtureIds.orgs.alpha)
    .eq('title', title);
}

async function createComplianceFiling(adminDb: any, title: string) {
  const { data, error } = await adminDb
    .from('filing_calendar')
    .insert({
      org_id: fixtureIds.orgs.alpha,
      filing_type: 'form_990pf',
      title,
      due_date: '2026-12-15',
      jurisdiction: 'Federal',
      description: 'Created by the deep compliance attachment walkthrough.',
      status: 'upcoming',
      attachments: [],
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

test('deep reports journey: creates a template and generates a saved report document', async ({ page, adminDb }) => {
  const templateName = 'Deep Walkthrough Portfolio Report';

  await deleteReportArtifacts(adminDb, templateName);
  await loginAs(page, 'orgAdmin', { landOnDashboard: false });
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto('/dashboard/reports?tab=templates', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByRole('heading', { name: 'Report Templates' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: 'Create Template' }).click();
    await expect(page.getByRole('heading', { name: 'Create Template' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await page.locator('input[placeholder="e.g., Quarterly Impact Report"]').fill(templateName);
    await page.locator('textarea[placeholder="Describe what this template is for..."]').fill(
      'Created by the deep reports exploratory walkthrough.'
    );
    await page.getByRole('combobox').nth(1).selectOption('6m');

    const createTemplateResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/portfolio/${fixtureIds.portfolios.alpha}/reports/templates`) &&
      response.request().method() === 'POST',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Create Template' }).last().click();
    const createTemplateResponse = await createTemplateResponsePromise;
    expect(createTemplateResponse.status()).toBe(201);

    await expect(page.getByText(templateName)).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: template } = await adminDb
      .from('report_templates')
      .select('id, name, scope, config')
      .eq('portfolio_id', fixtureIds.portfolios.alpha)
      .eq('name', templateName)
      .single();

    expect(template?.scope).toBe('portfolio');
    expect(template?.config?.time_range).toBe('6m');
    expect(template?.config?.include_sections).toContain('overview');

    const generateResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/portfolio/${fixtureIds.portfolios.alpha}/reports/generate`) &&
      response.request().method() === 'POST',
      { timeout: COLD_APP_TIMEOUT }
    );
    await page.getByRole('button', { name: 'Generate' }).click();
    const generateResponse = await generateResponsePromise;
    expect(generateResponse.status()).toBe(200);

    await expect(page.getByRole('heading', { name: templateName })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByText('portfolio report', { exact: true })).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    const { data: document } = await adminDb
      .from('generated_documents')
      .select('id, template_id, title, document_type, format, scope, status, content, config')
      .eq('portfolio_id', fixtureIds.portfolios.alpha)
      .eq('title', templateName)
      .single();

    expect(document?.template_id).toBe(template!.id);
    expect(document?.document_type).toBe('report');
    expect(document?.format).toBe('html');
    expect(document?.scope).toBe('portfolio');
    expect(document?.status).toBe('generated');
    expect(document?.content?.content_blocks?.length).toBeGreaterThan(0);
    expect(document?.config?.time_range).toBe('6m');
  } finally {
    await deleteReportArtifacts(adminDb, templateName);
  }
});

test('deep analytics journey: loads analytics tabs and verifies risk, benchmark, and projection APIs', async ({ page, adminDb }) => {
  await cleanupAnalyticsFacts(adminDb);
  await seedAnalyticsFacts(adminDb);
  await loginAs(page, 'orgAdmin', { landOnDashboard: false });
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto(`/dashboard/analytics?portfolio_id=${fixtureIds.portfolios.alpha}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByText('Total Allocation')).toBeVisible({ timeout: COLD_APP_TIMEOUT });

    await page.getByRole('button', { name: 'View Projections' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Metric Projections' })).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    await page.getByRole('button', { name: 'Benchmarks' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Benchmark Comparison' })).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    await page.getByRole('button', { name: 'Risk' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Risk Analysis' })).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    await page.getByRole('button', { name: 'Insights' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Insights & Recommendations' })).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    const riskResponse = await page.request.get(
      `/api/portfolio/${fixtureIds.portfolios.alpha}/analytics/risk?risk_type=all&include_history=true`
    );
    expect(riskResponse.status()).toBe(200);
    const risk = await riskResponse.json();
    expect(risk.risk.total_holdings).toBeGreaterThan(0);
    expect(Number(risk.risk.total_allocation)).toBeGreaterThanOrEqual(0);
    expect(risk.risk.concentration).toBeTruthy();

    const benchmarkResponse = await page.request.get(
      `/api/portfolio/${fixtureIds.portfolios.alpha}/analytics/benchmarks?metrics=FUNDS_ALLOCATED`
    );
    expect(benchmarkResponse.status()).toBe(200);
    const benchmarks = await benchmarkResponse.json();
    expect(benchmarks.portfolio_benchmarks.total_holdings).toBeGreaterThan(0);
    expect(benchmarks.portfolio_benchmarks.sector_count).toBeGreaterThan(0);

    const projectionResponse = await page.request.get(
      `/api/portfolio/${fixtureIds.portfolios.alpha}/analytics/projections?metric_code=${ANALYTICS_METRIC}&periods_ahead=3&method=linear`
    );
    expect(projectionResponse.status()).toBe(200);
    const projection = await projectionResponse.json();
    expect(projection.projection.metric_code).toBe(ANALYTICS_METRIC);
    expect(projection.projection.historical_data_points).toBe(4);
    expect(projection.projection.projections).toHaveLength(3);

    const { data: cachedProjection } = await adminDb
      .from('metric_projections_cache')
      .select('id, historical_data_points, projections')
      .eq('portfolio_id', fixtureIds.portfolios.alpha)
      .eq('metric_code', ANALYTICS_METRIC)
      .eq('method', 'linear')
      .single();
    expect(cachedProjection?.historical_data_points).toBe(4);
    expect(cachedProjection?.projections).toHaveLength(3);
  } finally {
    await cleanupAnalyticsFacts(adminDb);
  }
});

test('deep compliance documents journey: uploads, downloads, and deletes a filing attachment', async ({ page, adminDb }) => {
  const filingTitle = 'Deep Walkthrough Attachment Filing';
  const fileName = 'deep-compliance-attachment.pdf';
  const fileBody = Buffer.from('%PDF-1.4\n% Deep compliance walkthrough attachment\n%%EOF\n');

  await deleteFilingByTitle(adminDb, filingTitle);
  const filingId = await createComplianceFiling(adminDb, filingTitle);
  await loginAs(page, 'orgAdmin', { landOnDashboard: false });
  await setActiveOrg(page, fixtureIds.orgs.alpha);

  try {
    await page.goto('/dashboard/compliance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Compliance' })).toBeVisible({ timeout: COLD_APP_TIMEOUT });
    await expect(page.getByText('Created by the deep compliance attachment walkthrough.')).toBeVisible({
      timeout: COLD_APP_TIMEOUT,
    });

    const uploadResponse = await page.request.post(
      `/api/org/${fixtureIds.orgs.alpha}/compliance/filing-calendar/${filingId}/attachments`,
      {
        multipart: {
          file: {
            name: fileName,
            mimeType: 'application/pdf',
            buffer: fileBody,
          },
        },
      }
    );
    expect(uploadResponse.status()).toBe(201);
    const uploaded = await uploadResponse.json();
    expect(uploaded.data.name).toBe(fileName);
    expect(uploaded.data.path).toContain(`${fixtureIds.orgs.alpha}/${filingId}/`);
    expect(uploaded.data.signed_url).toContain('/storage/v1/object/sign/compliance-documents/');

    const listResponse = await page.request.get(
      `/api/org/${fixtureIds.orgs.alpha}/compliance/filing-calendar/${filingId}/attachments`
    );
    expect(listResponse.status()).toBe(200);
    const listed = await listResponse.json();
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].name).toBe(fileName);
    expect(listed.data[0].signed_url).toBeTruthy();

    const downloadResponse = await page.request.get(listed.data[0].signed_url);
    expect(downloadResponse.status()).toBe(200);
    const downloaded = await downloadResponse.body();
    expect(downloaded.toString()).toContain('Deep compliance walkthrough attachment');

    const { data: filingWithAttachment } = await adminDb
      .from('filing_calendar')
      .select('attachments')
      .eq('id', filingId)
      .single();
    expect(filingWithAttachment?.attachments).toHaveLength(1);
    expect(filingWithAttachment?.attachments?.[0]?.name).toBe(fileName);

    const deleteResponse = await page.request.delete(
      `/api/org/${fixtureIds.orgs.alpha}/compliance/filing-calendar/${filingId}/attachments`,
      { data: { path: listed.data[0].path } }
    );
    expect(deleteResponse.status()).toBe(200);

    const afterDeleteResponse = await page.request.get(
      `/api/org/${fixtureIds.orgs.alpha}/compliance/filing-calendar/${filingId}/attachments`
    );
    expect(afterDeleteResponse.status()).toBe(200);
    const afterDelete = await afterDeleteResponse.json();
    expect(afterDelete.data).toHaveLength(0);
  } finally {
    await deleteFilingByTitle(adminDb, filingTitle);
  }
});
