import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('builder tools', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('exports set_ai_instructions tool definition', () => {
    expect(src).toMatch(/name:\s*['"]set_ai_instructions['"]/);
  });

  it('exports list_kpi_definitions tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_kpi_definitions['"]/);
  });

  it('exports update_metric_definition tool definition', () => {
    expect(src).toMatch(/name:\s*['"]update_metric_definition['"]/);
  });

  it('exports delete_metric_definition tool definition', () => {
    expect(src).toMatch(/name:\s*['"]delete_metric_definition['"]/);
  });

  it('update_org_branding accepts a name field', () => {
    expect(src).toMatch(/name:\s*['"]update_org_branding['"]/);
    // The tool's properties section must include a 'name' field (unquoted key)
    const idx = src.indexOf("name: 'update_org_branding'");
    const snippet = src.slice(idx, idx + 700);
    // properties block should contain `name:` as a property key after `properties: {`
    expect(snippet).toMatch(/properties[\s\S]{0,300}^\s+name\s*:/m);
  });

  it('does not import Anthropic SDK directly', () => {
    expect(src).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]/);
  });

  it('uses ToolDefinition type', () => {
    expect(src).toMatch(/ToolDefinition/);
  });
});
