import type { ConfigComparison } from '@/lib/config-template';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConfigCliArgs = {
  orgId: string;
  portfolioId?: string;
  actorId?: string;
  templatePath?: string;
};

type ParseOptions = {
  command: 'export' | 'diff' | 'apply';
  requireTemplate?: boolean;
  requireActor?: boolean;
};

function usage(options: ParseOptions): string {
  const template = options.requireTemplate ? ' --template <path>' : '';
  const actor = options.requireActor ? ' --actor <user-id>' : ' [--actor <user-id>]';
  return `Usage: npm run config:${options.command} -- --org <org-id>${template}${actor} [--portfolio <portfolio-id>]`;
}

function assertUuid(flag: string, value: string): string {
  if (!UUID.test(value)) throw new Error(`${flag} must be a UUID.`);
  return value;
}

/** Closed flag parser so operator typos never turn into a partial apply. */
export function parseConfigCliArgs(args: string[], options: ParseOptions): ConfigCliArgs {
  const allowed = new Set(['--org', '--portfolio', '--actor', '--template']);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error(`${usage(options)}\nUnknown argument: ${flag}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${usage(options)}\n${flag} requires a value.`);
    if (values.has(flag)) throw new Error(`${usage(options)}\n${flag} may be provided only once.`);
    values.set(flag, value);
    index += 1;
  }

  const org = values.get('--org');
  if (!org) throw new Error(`${usage(options)}\n--org is required.`);
  const template = values.get('--template');
  if (options.requireTemplate && !template) throw new Error(`${usage(options)}\n--template is required.`);
  const actor = values.get('--actor');
  if (options.requireActor && !actor) throw new Error(`${usage(options)}\n--actor is required.`);

  return {
    orgId: assertUuid('--org', org),
    portfolioId: values.has('--portfolio') ? assertUuid('--portfolio', values.get('--portfolio')!) : undefined,
    actorId: actor ? assertUuid('--actor', actor) : undefined,
    templatePath: template,
  };
}

export function formatConfigComparison(comparison: ConfigComparison): string {
  const lines: string[] = [];
  for (const status of ['create', 'update', 'same', 'extra'] as const) {
    for (const item of comparison[status]) {
      lines.push(`${status.padEnd(6)} ${item.section.padEnd(18)} ${item.key}`);
    }
  }
  return lines.join('\n');
}
