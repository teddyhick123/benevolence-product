/* eslint-disable no-console */
import { assertSupportedNode, commandWorks, run } from './lib';

assertSupportedNode();
if (!commandWorks('docker', ['info'])) {
  throw new Error('Docker is not running. Start Docker before setting up the walkthrough environment.');
}

console.log('Installing Playwright Chromium...');
run('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });

console.log('\nPreparing local Supabase and walkthrough fixtures...');
run('npx', ['ts-node', '--project', 'tsconfig.scripts.json', 'scripts/walkthrough/reset.ts'], { stdio: 'inherit' });
