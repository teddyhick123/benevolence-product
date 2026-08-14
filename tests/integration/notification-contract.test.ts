// tests/integration/notification-contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_ALERT_KEYS,
} from '@/lib/notifications/types';

const ROOT = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function readMigrations(): string {
  const migDir = join(ROOT, 'db/migrations');
  return readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');
}

const migrations = readMigrations();
const fanoutSrc = read('lib/notifications/fanout.ts');
const deliverySrc = read('lib/notifications/delivery.ts');
const notifEmailTemplate = read('lib/email/templates/task-notification.tsx');
const digestEmailTemplate = read('lib/email/templates/task-digest.tsx');
const settingsTabSrc = read('components/settings/NotificationsTab.tsx');

// ---------------------------------------------------------------------------
// 1. Schema: notification_events must have required columns
// ---------------------------------------------------------------------------
describe('notification_events schema', () => {
  const REQUIRED_COLUMNS = [
    'dedupe_key',
    'read_at',
    'delivery_attempts',
    'next_attempt_at',
    'updated_at',
    'task_event_id',
    'actor_id',
    'priority',
  ];

  for (const col of REQUIRED_COLUMNS) {
    it(`notification_events has column "${col}"`, () => {
      expect(migrations).toMatch(new RegExp(`\\b${col}\\b`));
    });
  }

  it('notification_events has cancelled status', () => {
    expect(migrations).toContain("'cancelled'");
  });

  it('notification_events has unique dedupe_key constraint', () => {
    expect(migrations).toMatch(/UNIQUE\s*\([^)]*dedupe_key[^)]*\)/i);
  });

  it('notification_events has recipient-scoped read_at update RLS', () => {
    expect(migrations).toMatch(/recipients can mark read/i);
  });
});

// ---------------------------------------------------------------------------
// 2. NOTIFICATION_EVENT_TYPES covers all types used in fanout
// ---------------------------------------------------------------------------
describe('NOTIFICATION_EVENT_TYPES coverage', () => {
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    it(`fanout.ts references '${eventType}'`, () => {
      expect(fanoutSrc).toContain(`'${eventType}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. NOTIFICATION_ALERT_KEYS appear in the settings UI
// ---------------------------------------------------------------------------
describe('NOTIFICATION_ALERT_KEYS coverage in settings', () => {
  for (const key of NOTIFICATION_ALERT_KEYS) {
    it(`settings tab references alert key '${key}'`, () => {
      expect(settingsTabSrc).toContain(`'${key}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Email templates are brand-agnostic (no hard-coded client names)
// ---------------------------------------------------------------------------
describe('Email template brand-agnosticism', () => {
  const FORBIDDEN_NAMES = ['Benevolence', 'benevolence'];

  for (const name of FORBIDDEN_NAMES) {
    it(`task-notification.tsx does not hard-code "${name}"`, () => {
      expect(notifEmailTemplate).not.toContain(name);
    });

    it(`task-digest.tsx does not hard-code "${name}"`, () => {
      expect(digestEmailTemplate).not.toContain(name);
    });
  }
});

// ---------------------------------------------------------------------------
// 5. Job routes use the shared notifications job boundary
// ---------------------------------------------------------------------------
describe('Job route security', () => {
  const fanoutRoute = read('app/api/jobs/notifications/fanout/route.ts');
  const sendRoute = read('app/api/jobs/notifications/send/route.ts');
  const digestRoute = read('app/api/jobs/notifications/digest/route.ts');

  for (const [name, route] of [
    ['fanout', fanoutRoute],
    ['send', sendRoute],
    ['digest', digestRoute],
  ]) {
    it(`${name} route requires the notifications job principal`, () => {
      expect(route).toContain("requireJobAccess(req, 'notifications')");
      expect(route).toContain('createNotificationJobRepository');
      expect(route).not.toContain('createAdminClient');
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Delivery uses retry backoff constants
// ---------------------------------------------------------------------------
describe('Delivery retry policy', () => {
  it('delivery.ts has retry backoff values (5min, 30min, 2hr)', () => {
    // 5 minutes: 5 * 60 = 300
    expect(deliverySrc).toMatch(/5\s*\*\s*60|300/);
    // 30 minutes: 30 * 60 = 1800
    expect(deliverySrc).toMatch(/30\s*\*\s*60|1800/);
    // 2 hours: 2 * 60 * 60 = 7200
    expect(deliverySrc).toMatch(/2\s*\*\s*60\s*\*\s*60|7200/);
  });

  it('delivery.ts suppresses after max attempts', () => {
    expect(deliverySrc).toMatch(/MAX_ATTEMPTS|maxAttempts/i);
    expect(deliverySrc).toMatch(/suppressed|suppression/i);
  });
});

// ---------------------------------------------------------------------------
// 7. Settings tab does NOT contain "coming soon"
// ---------------------------------------------------------------------------
describe('Settings tab completeness', () => {
  it('settings tab does not say "coming soon"', () => {
    expect(settingsTabSrc.toLowerCase()).not.toContain('coming soon');
  });
});
