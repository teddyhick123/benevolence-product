// lib/builder/scaffold-context.ts
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'templates/module');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'db/migrations');
const AGENTS_MD_PATH = path.join(PROJECT_ROOT, 'AGENTS.md');
const LEGACY_CLAUDE_MD_PATH = path.join(PROJECT_ROOT, 'CLAUDE.md');
const DONORS_ROUTE_PATH = path.join(PROJECT_ROOT, 'app/api/org/[orgId]/donors/route.ts');
const DONORS_COMPONENT_PATH = path.join(PROJECT_ROOT, 'components/donors/DonorList.tsx');

export interface ScaffoldContext {
  templateFiles: Array<{ name: string; content: string }>;
  exampleModule: string;
  agentInstructionsExcerpt: string;
  nextMigrationNumber: string;
  codebaseIndex: string;
}

export function buildScaffoldContext(codebaseIndex: string): ScaffoldContext {
  return {
    templateFiles: readTemplateFiles(),
    exampleModule: buildDonorsExample(),
    agentInstructionsExcerpt: extractAgentInstructionsExcerpt(),
    nextMigrationNumber: getNextMigrationNumber(),
    codebaseIndex,
  };
}

function readTemplateFiles(): Array<{ name: string; content: string }> {
  const result: Array<{ name: string; content: string }> = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = path.relative(TEMPLATES_DIR, fullPath);
        result.push({ name: rel, content: fs.readFileSync(fullPath, 'utf-8') });
      }
    }
  }
  walk(TEMPLATES_DIR);
  return result;
}

function buildDonorsExample(): string {
  const routeContent = fs.existsSync(DONORS_ROUTE_PATH)
    ? fs.readFileSync(DONORS_ROUTE_PATH, 'utf-8').slice(0, 3000)
    : '(donors route not found)';
  const componentContent = fs.existsSync(DONORS_COMPONENT_PATH)
    ? fs.readFileSync(DONORS_COMPONENT_PATH, 'utf-8').slice(0, 2000)
    : '(donors component not found)';

  return `### Example: donors module API route (app/api/org/[orgId]/donors/route.ts)\n\`\`\`typescript\n${routeContent}\n\`\`\`\n\n### Example: DonorList component (components/donors/DonorList.tsx)\n\`\`\`typescript\n${componentContent}\n\`\`\`\n`;
}

function extractAgentInstructionsExcerpt(): string {
  const instructionsPath = fs.existsSync(AGENTS_MD_PATH) ? AGENTS_MD_PATH : LEGACY_CLAUDE_MD_PATH;
  if (!fs.existsSync(instructionsPath)) return '(agent instructions not found)';
  const full = fs.readFileSync(instructionsPath, 'utf-8');
  const startMarker = '## Key Patterns';
  const endMarker = '## Getting Help';
  const start = full.indexOf(startMarker);
  const end = full.indexOf(endMarker);
  if (start === -1) return full.slice(0, 2000);
  const excerpt = end === -1 ? full.slice(start) : full.slice(start, end);
  return excerpt.slice(0, 3000);
}

export function getNextMigrationNumber(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const numbers = files
    .filter(f => /^\d{4}_/.test(f))
    .map(f => parseInt(f.slice(0, 4), 10))
    .filter(n => !isNaN(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(4, '0');
}

export function formatScaffoldContextForPrompt(ctx: ScaffoldContext): string {
  let out = '\n\n## Module Scaffold Context\n\n';

  out += '### Template Files (use these as your structural guide)\n';
  for (const f of ctx.templateFiles) {
    out += `\n#### templates/module/${f.name}\n\`\`\`\n${f.content}\n\`\`\`\n`;
  }

  out += '\n### Worked Example — donors module\n';
  out += ctx.exampleModule;

  out += '\n### Codebase Conventions (from agent instructions)\n';
  out += ctx.agentInstructionsExcerpt;

  out += `\n\n### Next available migration number: ${ctx.nextMigrationNumber}\n`;
  out += `Use this exact number (zero-padded to 4 digits) for the migration filename.\n`;

  out += '\n### Current codebase index\n';
  out += ctx.codebaseIndex;

  return out;
}
