// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_REGISTRY } from '@/lib/modules/registry';
import {
  PORTFOLIO_TOOLS,
  TOOL_DEFINITION_BY_NAME,
} from '@/lib/ai/assistant/tool-definitions';
import {
  TOOL_EXECUTOR_BY_NAME,
  TOOL_EXECUTORS_BY_MODULE,
} from '@/lib/ai/assistant/executor';

function sorted(values: Iterable<string>) {
  return [...values].sort();
}

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('portfolio assistant registry', () => {
  it('registers every definition and executor exactly once', () => {
    const definitionNames = PORTFOLIO_TOOLS.map((tool) => tool.name);
    const executorEntries = Object.values(TOOL_EXECUTORS_BY_MODULE)
      .flatMap((registry) => Object.entries(registry ?? {}));
    const executorNames = executorEntries.map(([name]) => name);

    expect(new Set(definitionNames).size).toBe(definitionNames.length);
    expect(new Set(executorNames).size).toBe(executorNames.length);
    expect(sorted(definitionNames)).toEqual(sorted(executorNames));
    expect(sorted(TOOL_DEFINITION_BY_NAME.keys())).toEqual(sorted(definitionNames));
    expect(sorted(Object.keys(TOOL_EXECUTOR_BY_NAME))).toEqual(sorted(executorNames));
  });

  it('does not advertise module tools without a definition and executor', () => {
    const definitions = new Set(TOOL_DEFINITION_BY_NAME.keys());
    const executors = new Set(Object.keys(TOOL_EXECUTOR_BY_NAME));

    for (const moduleDefinition of Object.values(MODULE_REGISTRY)) {
      for (const tool of moduleDefinition.tools) {
        expect(definitions.has(tool), `${moduleDefinition.id} definition: ${tool}`).toBe(true);
        expect(executors.has(tool), `${moduleDefinition.id} executor: ${tool}`).toBe(true);
      }
    }
  });

  it('keeps the Phase 3 type and file-size ratchets closed', () => {
    const libTypeScript = filesUnder('lib').filter((file) => file.endsWith('.ts'));
    const aiTypeScript = filesUnder('lib/ai').filter(
      (file) => file.endsWith('.ts') && !file.includes('/assistant/actions/'),
    );

    expect(
      libTypeScript.filter((file) => readFileSync(file, 'utf8').includes(
        '@ts-' + 'nocheck'
      ))
    ).toEqual([]);
    expect(
      aiTypeScript
        .map((file) => ({ file, lines: readFileSync(file, 'utf8').split('\n').length }))
        .filter(({ lines }) => lines > 500)
    ).toEqual([]);
  });
});
