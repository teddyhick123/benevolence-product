// lib/builder/__tests__/builder-tools-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('builder workflow tools', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  const workflowTools = [
    'add_checklist_item',
    'remove_checklist_item',
    'set_required_field',
    'remove_required_field',
    'rename_stage',
    'set_approval_requirement',
    'list_workflow_config',
  ];

  for (const tool of workflowTools) {
    it(`exports ${tool} tool definition`, () => {
      expect(src).toMatch(new RegExp(`name:\\s*['"]${tool}['"]`));
    });
  }

  it('add_checklist_item requires stage_key, item_key, label, required', () => {
    const idx = src.indexOf("name: 'add_checklist_item'");
    const snippet = src.slice(idx, idx + 600);
    expect(snippet).toMatch(/stage_key/);
    expect(snippet).toMatch(/item_key/);
    expect(snippet).toMatch(/label/);
    expect(snippet).toMatch(/required/);
  });

  it('set_required_field validates field_name against allowlist', () => {
    const idx = src.indexOf("name: 'set_required_field'");
    const snippet = src.slice(idx, idx + 600);
    expect(snippet).toMatch(/field_name/);
    expect(snippet).toMatch(/REQUIRED_FIELD_ALLOWLIST|purpose/);
  });

  it('rename_stage requires stage_key and label', () => {
    const idx = src.indexOf("name: 'rename_stage'");
    const snippet = src.slice(idx, idx + 400);
    expect(snippet).toMatch(/stage_key/);
    expect(snippet).toMatch(/label/);
  });
});
