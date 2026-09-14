import { describe, expect, it } from 'vitest';
import { formatConfigComparison, parseConfigCliArgs } from '@/scripts/config-cli';

const ORG = '11111111-1111-4111-8111-111111111111';
const PORTFOLIO = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';

describe('configuration template CLI arguments', () => {
  it('accepts only explicit, well-formed flags', () => {
    expect(parseConfigCliArgs(
      ['--org', ORG, '--template', 'ford.json', '--actor', ACTOR, '--portfolio', PORTFOLIO],
      { command: 'apply', requireTemplate: true, requireActor: true },
    )).toEqual({ orgId: ORG, portfolioId: PORTFOLIO, actorId: ACTOR, templatePath: 'ford.json' });
    expect(() => parseConfigCliArgs(['--org', ORG, '--actor', ACTOR], {
      command: 'apply', requireTemplate: true, requireActor: true,
    })).toThrow(/--template is required/);
    expect(() => parseConfigCliArgs(['--org', 'not-a-uuid'], { command: 'export' }))
      .toThrow(/--org must be a UUID/);
    expect(() => parseConfigCliArgs(['--org', ORG, '--surprise', 'value'], { command: 'export' }))
      .toThrow(/Unknown argument/);
  });

  it('formats deterministic grouped comparison lines', () => {
    expect(formatConfigComparison({
      create: [{ section: 'kpis', key: 'people_reached', status: 'create' }],
      update: [],
      same: [{ section: 'modules', key: 'portfolio', status: 'same' }],
      extra: [{ section: 'views', key: 'dashboard.main', status: 'extra' }],
    })).toBe(
      'create kpis               people_reached\n' +
      'same   modules            portfolio\n' +
      'extra  views              dashboard.main',
    );
  });
});
