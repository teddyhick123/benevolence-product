// lib/builder/codebase-index.ts
import fs from 'fs';
import path from 'path';

export interface CodebaseIndex {
  apiRoutes: Array<{ path: string; methods: string[] }>;
  dbTables: Array<{ name: string; columns: string[] }>;
  components: Array<{ name: string; file: string }>;
  libModules: Array<{ file: string; exports: string[] }>;
  builtAt: string;
}

let _index: CodebaseIndex | null = null;

export function getCodebaseIndex(): CodebaseIndex {
  if (_index) return _index;
  _index = buildIndex();
  return _index;
}

function buildIndex(): CodebaseIndex {
  const root = process.cwd();
  return {
    apiRoutes: scanApiRoutes(path.join(root, 'app', 'api')),
    dbTables: scanDbTables(path.join(root, 'db', 'migrations')),
    components: scanComponents(path.join(root, 'components')),
    libModules: scanLibModules(path.join(root, 'lib')),
    builtAt: new Date().toISOString(),
  };
}

function scanApiRoutes(dir: string): Array<{ path: string; methods: string[] }> {
  const results: Array<{ path: string; methods: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string, routePath: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const segment = entry.name.replace(/^\[(.+)\]$/, ':$1');
        walk(path.join(current, entry.name), `${routePath}/${segment}`);
      } else if (entry.name === 'route.ts') {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
          .filter(m => new RegExp(`export async function ${m}\\b`).test(content));
        if (methods.length > 0) {
          results.push({ path: routePath, methods });
        }
      }
    }
  }

  walk(dir, '/api');
  return results;
}

function scanDbTables(dir: string): Array<{ name: string; columns: string[] }> {
  const results: Array<{ name: string; columns: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const tableMatches = content.matchAll(
      /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi
    );
    for (const match of tableMatches) {
      const tableName = match[1];
      const body = match[2];
      const columns = body
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|CREATE|--)/i.test(l))
        .map(l => l.split(/\s+/)[0].replace(/,?$/, ''))
        .filter(name => /^\w+$/.test(name));
      results.push({ name: tableName, columns });
    }
  }

  return results;
}

function scanComponents(dir: string): Array<{ name: string; file: string }> {
  const results: Array<{ name: string; file: string }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name));
      } else if (entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const match = content.match(/export default function (\w+)/);
        if (match) {
          const relPath = path.relative(process.cwd(), path.join(current, entry.name));
          results.push({ name: match[1], file: relPath });
        }
      }
    }
  }

  walk(dir);
  return results;
}

function scanLibModules(dir: string): Array<{ file: string; exports: string[] }> {
  const results: Array<{ file: string; exports: string[] }> = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(current, entry.name));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        const content = fs.readFileSync(path.join(current, entry.name), 'utf8');
        const exportMatches = content.matchAll(/export (?:async function|function|const|class|type|interface) (\w+)/g);
        const exports = [...exportMatches].map(m => m[1]);
        if (exports.length > 0) {
          const relPath = path.relative(process.cwd(), path.join(current, entry.name));
          results.push({ file: relPath, exports });
        }
      }
    }
  }

  walk(dir);
  return results;
}

export function formatIndexForPrompt(index: CodebaseIndex): string {
  const lines: string[] = ['## Codebase Index'];

  lines.push('\n### API Routes');
  for (const r of index.apiRoutes) {
    lines.push(`${r.methods.join(',')} ${r.path}`);
  }

  lines.push('\n### Database Tables');
  for (const t of index.dbTables) {
    lines.push(`${t.name}: ${t.columns.join(', ')}`);
  }

  const base = lines.join('\n');
  if (Buffer.byteLength(base, 'utf8') >= 8000) {
    return base;
  }

  const compLines: string[] = ['\n### Components'];
  for (const c of index.components) {
    compLines.push(`${c.name} (${c.file})`);
  }
  const withComponents = base + '\n' + compLines.join('\n');
  if (Buffer.byteLength(withComponents, 'utf8') >= 8000) {
    return base;
  }

  const libLines: string[] = ['\n### Lib Exports'];
  for (const m of index.libModules) {
    libLines.push(`${m.file}: ${m.exports.join(', ')}`);
  }
  const full = withComponents + '\n' + libLines.join('\n');
  return Buffer.byteLength(full, 'utf8') < 8000 ? full : withComponents;
}
