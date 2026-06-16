import { execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export type LocalSupabaseStatus = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl?: string;
};

export function assertSupportedNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20) {
    throw new Error(`Node.js 20+ is required by the current app dependencies. Found ${major}.${minor}.`);
  }
}

export function run(command: string, args: string[], options: { stdio?: 'inherit' | 'pipe' } = {}) {
  return execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
    env: process.env,
  });
}

export function commandWorks(command: string, args: string[] = []): boolean {
  try {
    execFileSync(command, args, { cwd: PROJECT_ROOT, stdio: 'ignore', env: process.env });
    return true;
  } catch {
    return false;
  }
}

export function assertCanonicalMigrationLink() {
  const link = path.join(PROJECT_ROOT, 'supabase/migrations');
  if (!existsSync(link) || !lstatSync(link).isSymbolicLink()) {
    throw new Error('supabase/migrations must be a symlink to ../db/migrations.');
  }

  const target = readlinkSync(link);
  if (target !== '../db/migrations') {
    throw new Error(`supabase/migrations points to ${target}; expected ../db/migrations.`);
  }
}

export function isLocalUrl(value: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function assertLocalUrl(value: string, label: string) {
  if (!isLocalUrl(value)) {
    throw new Error(`${label} must target localhost for walkthrough operations. Received: ${value}`);
  }
}

export function getLocalStatus(): LocalSupabaseStatus {
  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const status = JSON.parse(raw) as Record<string, string>;
  const apiUrl = status.API_URL ?? status.api_url;
  const anonKey = status.ANON_KEY ?? status.anon_key;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
  const dbUrl = status.DB_URL ?? status.db_url;

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase status did not include API_URL, ANON_KEY, and SERVICE_ROLE_KEY.');
  }

  assertLocalUrl(apiUrl, 'Supabase API URL');
  if (dbUrl && !dbUrl.includes('@127.0.0.1:') && !dbUrl.includes('@localhost:')) {
    throw new Error(`Supabase DB URL must target localhost. Received: ${dbUrl}`);
  }

  return { apiUrl, anonKey, serviceRoleKey, dbUrl };
}

export function localAppEnv(status = getLocalStatus()): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: status.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.anonKey,
    SUPABASE_SERVICE_ROLE: status.serviceRoleKey,
    NEXT_DIST_DIR: '.next-walkthrough',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
    WALKTHROUGH_MODE: '1',
  };
}

export function spawnInherited(command: string, args: string[], env = process.env) {
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('exit', code => process.exit(code ?? 1));
  child.on('error', error => {
    console.error(error);
    process.exit(1);
  });
}
