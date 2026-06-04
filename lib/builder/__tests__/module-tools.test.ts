import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('update_module_config tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('does not hardcode stale module keys (tax, donors, compliance, quickbooks)', () => {
    const toolIdx = src.indexOf("name: 'update_module_config'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).not.toMatch(/'tax'|"tax"/);
    expect(snippet).not.toMatch(/'donors'|"donors"/);
    expect(snippet).not.toMatch(/'quickbooks'|"quickbooks"/);
  });

  it('enum includes all mutable ModuleId values', () => {
    expect(src).toMatch(/impact_tracking/);
    expect(src).toMatch(/tax_optimization/);
    expect(src).toMatch(/grant_management/);
    expect(src).toMatch(/donor_management/);
    expect(src).toMatch(/pledge_tracking/);
    expect(src).toMatch(/compliance_regulatory/);
  });

  it('executor calls enableModule or disableModule instead of writing modules JSONB directly', () => {
    const caseIdx = src.indexOf("case 'update_module_config'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/enableModule|disableModule/);
    expect(snippet).not.toMatch(/\.update\(\s*\{\s*modules/);
  });

  it('imports enableModule and disableModule from lib/modules', () => {
    expect(src).toMatch(/enableModule/);
    expect(src).toMatch(/disableModule/);
  });

  it('core module is NOT in the mutable enum', () => {
    const toolIdx = src.indexOf("name: 'update_module_config'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).not.toMatch(/'core'|"core"/);
  });
});

describe('list_modules tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has a list_modules tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_modules['"]/);
  });

  it('executor calls getOrgEnabledModules', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 500);
    expect(snippet).toMatch(/getOrgEnabledModules/);
  });

  it('executor returns canToggle field', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/canToggle/);
  });

  it('core module is listed but canToggle is false', () => {
    const caseIdx = src.indexOf("case 'list_modules'");
    const snippet = src.slice(caseIdx, caseIdx + 800);
    expect(snippet).toMatch(/isCore|is_core/);
  });
});
