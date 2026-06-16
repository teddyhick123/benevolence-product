import { spawnSync } from 'node:child_process';
import { assertSupportedNode, localAppEnv, PROJECT_ROOT } from './lib';

assertSupportedNode();

const requestedArgs = process.argv.slice(2);
const testGroups = requestedArgs.length > 0
  ? [requestedArgs]
  : [
      ['tests/walkthrough/smoke'],
      ['tests/walkthrough/journeys'],
    ];
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
