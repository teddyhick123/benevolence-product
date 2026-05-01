import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold_module tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('exports scaffold_module tool definition', () => {
    expect(src).toMatch(/name:\s*['"]scaffold_module['"]/);
  });

  it('scaffold_module requires a description parameter', () => {
    const idx = src.indexOf("name: 'scaffold_module'");
    const snippet = src.slice(idx, idx + 900);
    expect(snippet).toMatch(/required[\s\S]{0,200}description/);
  });

  it('ToolResult union includes scaffold_plan_ready type', () => {
    expect(src).toMatch(/scaffold_plan_ready/);
  });

  it('ScaffoldPlanContent interface is exported', () => {
    expect(src).toMatch(/export interface ScaffoldPlanContent/);
  });

  it('uses AI_MODELS.scaffoldPlan for the planning call', () => {
    expect(src).toMatch(/AI_MODELS\.scaffoldPlan/);
  });
});
