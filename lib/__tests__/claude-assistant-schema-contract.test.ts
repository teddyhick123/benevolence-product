import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const assistantSrc = readFileSync('lib/claude-assistant.ts', 'utf8');
const migrationsSrc = readdirSync('db/migrations')
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(join('db/migrations', file), 'utf8'))
  .join('\n');

function unique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function parseDbObjects() {
  const tables = unique(
    Array.from(migrationsSrc.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi))
      .map(match => match[1])
  );
  const views = unique(
    Array.from(migrationsSrc.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi))
      .map(match => match[1])
  );
  return new Set([...tables, ...views]);
}

function parseFunctions() {
  const functions = new Map<string, string[]>();
  for (const match of migrationsSrc.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const params = Array.from(match[2].matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:uuid|text|int|integer|numeric|jsonb|boolean|date|timestamptz|timestamp)/gi))
      .map(param => param[1]);
    functions.set(match[1], params);
  }
  return functions;
}

function parseTableColumns() {
  const columns = new Map<string, Set<string>>();

  for (const match of migrationsSrc.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\n\);/gi)) {
    const table = match[1];
    const set = columns.get(table) ?? new Set<string>();
    for (const line of match[2].split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      if (/^(CONSTRAINT|UNIQUE|PRIMARY|FOREIGN|CHECK|EXCLUDE)\b/i.test(trimmed)) continue;
      const column = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s/)?.[1];
      if (column) set.add(column);
    }
    columns.set(table, set);
  }

  for (const match of migrationsSrc.matchAll(/ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s+([\s\S]*?);/gi)) {
    const table = match[1];
    const set = columns.get(table);
    if (!set) continue;
    for (const add of match[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
      set.add(add[1]);
    }
  }

  return columns;
}

function parseObjectKeys(body: string) {
  return unique(
    Array.from(body.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm))
      .map(match => match[1])
  );
}

function extractMutationObjects(src: string) {
  const mutations: Array<{ table: string; op: string; body: string }> = [];
  const fromRegex = /\.from\(['"]([^'"]+)['"]\)/g;
  for (const fromMatch of src.matchAll(fromRegex)) {
    const table = fromMatch[1];
    const window = src.slice(fromMatch.index ?? 0, (fromMatch.index ?? 0) + 900);
    const opMatch = window.match(/\.(insert|update)\(\{/);
    if (!opMatch || opMatch.index === undefined) continue;

    const op = opMatch[1];
    const objectStart = (fromMatch.index ?? 0) + opMatch.index + opMatch[0].length - 1;
    let depth = 0;
    let objectEnd = -1;
    for (let i = objectStart; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      if (src[i] === '}') depth -= 1;
      if (depth === 0) {
        objectEnd = i;
        break;
      }
    }
    if (objectEnd !== -1) {
      mutations.push({ table, op, body: src.slice(objectStart + 1, objectEnd) });
    }
  }
  return mutations;
}

function extractStaticSelects(src: string) {
  const selects: Array<{ table: string; body: string }> = [];
  const fromRegex = /\.from\(['"]([^'"]+)['"]\)/g;
  for (const fromMatch of src.matchAll(fromRegex)) {
    const table = fromMatch[1];
    const window = src.slice(fromMatch.index ?? 0, (fromMatch.index ?? 0) + 700);
    const selectMatch = window.match(/\.select\(\s*(['"`])([\s\S]*?)\1/);
    if (selectMatch) {
      selects.push({ table, body: selectMatch[2] });
    }
  }
  return selects;
}

function splitTopLevelSelects(body: string) {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function relationName(token: string) {
  const relation = token.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(?:![a-zA-Z_][a-zA-Z0-9_]*)?\((.*)\)$/);
  if (!relation) return null;
  return {
    table: relation[1],
    columns: splitTopLevelSelects(relation[2]),
  };
}

describe('claude-assistant schema contract', () => {
  it('only queries tables/views present in active migrations', () => {
    const dbObjects = parseDbObjects();
    const targets = unique(
      Array.from(assistantSrc.matchAll(/\.from\(['"]([^'"]+)['"]\)/g))
        .map(match => match[1])
    );

    expect(targets.filter(target => !dbObjects.has(target))).toEqual([]);
  });

  it('only calls RPCs present in active migrations with canonical params', () => {
    const functions = parseFunctions();
    const badCalls = [];

    for (const match of assistantSrc.matchAll(/\.rpc\(['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\}\)/g)) {
      const functionName = match[1];
      const params = functions.get(functionName);
      const args = unique(
        Array.from(match[2].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g))
          .map(arg => arg[1])
      );

      if (!params) {
        badCalls.push(`${functionName}: missing function`);
        continue;
      }

      const allowed = new Set(params);
      const badArgs = args.filter(arg => !allowed.has(arg));
      if (badArgs.length > 0) {
        badCalls.push(`${functionName}: ${badArgs.join(', ')}`);
      }
    }

    expect(badCalls).toEqual([]);
  });

  it('insert/update object keys are columns on their target tables', () => {
    const tableColumns = parseTableColumns();
    const problems = [];

    for (const mutation of extractMutationObjects(assistantSrc)) {
      const table = mutation.table;
      const columns = tableColumns.get(table);
      if (!columns) continue;

      const keys = parseObjectKeys(mutation.body);
      const badKeys = keys.filter(key => !columns.has(key));
      if (badKeys.length > 0) {
        problems.push(`${table}.${mutation.op}: ${badKeys.join(', ')}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it('static select column lists only use active columns', () => {
    const tableColumns = parseTableColumns();
    const problems = [];

    for (const selection of extractStaticSelects(assistantSrc)) {
      const columns = tableColumns.get(selection.table);
      if (!columns) continue;

      for (const token of splitTopLevelSelects(selection.body)) {
        if (token === '*' || token.endsWith('(*)')) continue;

        const relation = relationName(token);
        if (relation) {
          const relationColumns = tableColumns.get(relation.table);
          if (!relationColumns) continue;
          const badRelationColumns = relation.columns
            .filter(column => column !== '*')
            .filter(column => !tableColumns.has(column))
            .filter(column => !relationColumns.has(column));
          if (badRelationColumns.length > 0) {
            problems.push(`${selection.table}.${relation.table}: ${badRelationColumns.join(', ')}`);
          }
          continue;
        }

        const column = token.split(/\s+/)[0];
        if (!columns.has(column)) {
          problems.push(`${selection.table}: ${column}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
