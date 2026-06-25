import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { assertSupportedNode, localAppEnv, PROJECT_ROOT } from './lib';

assertSupportedNode();

function journeySpecGroups() {
  const journeyDir = path.join(PROJECT_ROOT, 'tests/walkthrough/journeys');
  return readdirSync(journeyDir)
    .filter(file => file.endsWith('.spec.ts'))
    .sort()
    .map(file => [`tests/walkthrough/journeys/${file}`]);
}

const requestedArgs = process.argv.slice(2);
const testGroups = requestedArgs.length === 0
  ? [['tests/walkthrough/smoke'], ...journeySpecGroups()]
  : requestedArgs.length === 1 && requestedArgs[0] === 'tests/walkthrough/journeys'
    ? journeySpecGroups()
    : [requestedArgs];
const env = localAppEnv();

for (const args of testGroups) {
  const result = spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
