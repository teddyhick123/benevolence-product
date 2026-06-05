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

  it('validates module and enabled inputs before mutation', () => {
    const caseIdx = src.indexOf("case 'update_module_config'");
    const snippet = src.slice(caseIdx, caseIdx + 900);
    expect(snippet).toMatch(/validateEnum\(toolInput\.module/);
    expect(snippet).toMatch(/requiredBoolean\(toolInput\.enabled/);
  });
});

describe('builder mutation input validation', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('validates branding fields before updating organizations', () => {
    const caseIdx = src.indexOf("case 'update_org_branding'");
    const snippet = src.slice(caseIdx, caseIdx + 1100);
    expect(snippet).toMatch(/optionalString\(toolInput\.name/);
    expect(snippet).toMatch(/validateUrl\(toolInput\.logo_url/);
    expect(snippet).toMatch(/toolInput\.primary_color/);
  });

  it('validates create metric fields before inserting KPI definitions', () => {
    const caseIdx = src.indexOf("case 'create_metric_definition'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/requiredString\(toolInput\.name/);
    expect(snippet).toMatch(/requiredString\(toolInput\.slug/);
    expect(snippet).toMatch(/optionalEnum\(toolInput\.aggregation/);
    expect(snippet).toMatch(/optionalEnum\(toolInput\.direction/);
  });

  it('validates update and delete metric IDs as UUIDs', () => {
    const updateIdx = src.indexOf("case 'update_metric_definition'");
    const deleteIdx = src.indexOf("case 'delete_metric_definition'");
    expect(src.slice(updateIdx, updateIdx + 700)).toMatch(/requiredUuid\(toolInput\.id/);
    expect(src.slice(deleteIdx, deleteIdx + 500)).toMatch(/requiredUuid\(toolInput\.id/);
  });

  it('validates code proposal files and relative paths before creating proposals', () => {
    const helperIdx = src.indexOf('function validateProposalFiles');
    const caseIdx = src.indexOf("case 'submit_code_proposal'");
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateBuilderPath/);
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateRequired\(value,\s*'files'\)/);
    expect(src.slice(caseIdx, caseIdx + 900)).toMatch(/validateProposalFiles\(toolInput\.files\)/);
  });

  it('validates workflow steps before updating or cloning templates', () => {
    const helperIdx = src.indexOf('function validateWorkflowSteps');
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/validateRequired\(value,\s*'steps'\)/);
    expect(src.slice(helperIdx, helperIdx + 1200)).toMatch(/steps\[\$\{index\}\]\.order/);
    expect(src.slice(caseIdx, caseIdx + 700)).toMatch(/validateWorkflowSteps\(toolInput\.steps\)/);
  });

  it('awaits telemetry after successful mutations', () => {
    expect(src).not.toMatch(/void\s+emitBuilderEvent/);
    expect(src).toMatch(/await emitBuilderEvent/);
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

describe('update_workflow_template tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has an update_workflow_template tool definition', () => {
    expect(src).toMatch(/name:\s*['"]update_workflow_template['"]/);
  });

  it('requires template_id and steps', () => {
    const toolIdx = src.indexOf("name: 'update_workflow_template'");
    const snippet = src.slice(toolIdx, toolIdx + 600);
    expect(snippet).toMatch(/required.*template_id/s);
    expect(snippet).toMatch(/required.*steps/s);
  });

  it('executor validates template_id as UUID', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 600);
    expect(snippet).toMatch(/requiredUuid\(toolInput\.template_id/);
  });

  it('executor rejects cross-org templates', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/forbidden|cross.org|another org/i);
  });

  it('executor performs clone-on-write for system templates', () => {
    const caseIdx = src.indexOf("case 'update_workflow_template'");
    const snippet = src.slice(caseIdx, caseIdx + 1500);
    expect(snippet).toMatch(/is_system|isSystem/);
    expect(snippet).toMatch(/insert/i);
  });
});

describe('list_proposals tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('has a list_proposals tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_proposals['"]/);
  });

  it('phase filter is optional', () => {
    const toolIdx = src.indexOf("name: 'list_proposals'");
    const snippet = src.slice(toolIdx, toolIdx + 400);
    // 'required' array should be absent or empty for list_proposals
    expect(snippet).not.toMatch(/required:\s*\[\s*['"]phase['"]/);
  });

  it('executor queries builder_proposals scoped to orgId', () => {
    const caseIdx = src.indexOf("case 'list_proposals'");
    expect(caseIdx).toBeGreaterThan(-1);
    const snippet = src.slice(caseIdx, caseIdx + 600);
    expect(snippet).toMatch(/builder_proposals/);
    expect(snippet).toMatch(/org_id.*orgId|orgId.*org_id/);
  });
});
