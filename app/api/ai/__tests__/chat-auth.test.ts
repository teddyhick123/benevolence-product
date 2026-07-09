// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('AI chat viewer write bypass', () => {
  const chatSrc = readFileSync('app/api/ai/chat/route.ts', 'utf8');
  const assistantSrc = readFileSync('lib/ai/assistant/executor.ts', 'utf8');
  const grantExecutorSrc = readFileSync('lib/ai/assistant/executors/grants.ts', 'utf8');
  const actionExecutorSrc = readFileSync('lib/ai-action-executor.ts', 'utf8');

  it('chat route passes memberRole to assistant.chat()', () => {
    expect(chatSrc).toContain('memberRole');
  });

  it('chat route imports the provider-neutral assistant entrypoint', () => {
    expect(chatSrc).toContain("@/lib/ai/portfolio-assistant");
    expect(chatSrc).not.toContain("ClaudePortfolioAssistant");
  });

  it('executeTool guards write tools from viewers', () => {
    expect(assistantSrc).toMatch(/viewer/i);
    expect(assistantSrc).toMatch(/WRITE_TOOLS|write_tools/i);
  });

  it('viewer write guard includes every assistant tool that mutates records', () => {
    const mutatingTools = [
      'create_widget',
      'create_portfolio_widget',
      'add_location',
      'save_report_template',
      'refresh_charity_data',
      'start_due_diligence',
      'complete_workflow_task',
      'track_milestone',
      'schedule_reminder',
      'log_grant_communication',
      'record_grant_payment',
      'log_contribution_received',
      'generate_receipt',
      'generate_acknowledgment',
      'track_filing_deadline',
    ];

    for (const tool of mutatingTools) {
      expect(assistantSrc).toContain(`'${tool}'`);
    }
  });

  it('grant assistant tools are scoped to the active portfolio', () => {
    expect(assistantSrc).toContain("{ ...args, portfolio_id: portfolioId }");
    expect(grantExecutorSrc).toContain(".eq('portfolio_id', portfolioId)");
    expect(grantExecutorSrc).toContain(".eq('workflow_instances.portfolio_id', portfolioId)");
    expect(grantExecutorSrc).not.toContain('portfolio_id ?? portfolioId');
  });

  it('holding-child assistant writes verify holding ownership before insert', () => {
    expect(actionExecutorSrc).toContain('requireHoldingInPortfolio');
    expect(actionExecutorSrc).toContain(".eq('portfolio_id', portfolioId)");
    expect(actionExecutorSrc).toMatch(/requireHoldingInPortfolio\(args\.holding_id, portfolioId\);[\s\S]*from\('metric_facts'\)/);
    expect(actionExecutorSrc).toMatch(/requireHoldingInPortfolio\(args\.holding_id, portfolioId\);[\s\S]*from\('holding_widgets'\)/);
    expect(actionExecutorSrc).toMatch(/requireHoldingInPortfolio\(args\.holding_id, portfolioId\);[\s\S]*from\('holding_locations'\)/);
  });

  it('assistant holding and widget read tools are scoped to the active portfolio', () => {
    expect(assistantSrc).toMatch(/case 'get_holding_details':[\s\S]*\.eq\('id', args\.holding_id\)[\s\S]*\.eq\('portfolio_id', portfolioId\)/);
    expect(assistantSrc).toMatch(/case 'display_widget':[\s\S]*\.eq\('id', args\.widget_id\)[\s\S]*\.eq\('portfolio_id', portfolioId\)/);
    expect(assistantSrc).toMatch(/case 'generate_holding_report':[\s\S]*\.eq\('id', args\.holding_id\)[\s\S]*\.eq\('portfolio_id', portfolioId\)/);
    expect(assistantSrc).toMatch(/case 'search_similar_charities':[\s\S]*\.eq\('id', args\.holding_id\)[\s\S]*\.eq\('portfolio_id', portfolioId\)/);
    expect(assistantSrc).toMatch(/case 'benchmark_holding':[\s\S]*\.eq\('id', args\.holding_id\)[\s\S]*\.eq\('portfolio_id', portfolioId\)/);
  });
});
