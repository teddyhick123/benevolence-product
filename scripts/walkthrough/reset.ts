/* eslint-disable no-console */
import { assertCanonicalMigrationLink, assertSupportedNode, commandWorks, run } from './lib';

assertSupportedNode();
if (!commandWorks('docker', ['info'])) {
  throw new Error('Docker is not running. Start Docker before resetting the walkthrough environment.');
}

assertCanonicalMigrationLink();

console.log('Starting local Supabase...');
run('npx', ['supabase', 'start'], { stdio: 'inherit' });

console.log('\nResetting local database from canonical db/migrations...');
run('npx', ['supabase', 'db', 'reset', '--local', '--no-seed'], { stdio: 'inherit' });

console.log('\nSeeding deterministic walkthrough personas...');
run('npx', ['ts-node', '--project', 'tsconfig.scripts.json', 'scripts/walkthrough/seed.ts'], { stdio: 'inherit' });

console.log('\nWalkthrough baseline is ready. Run npm run walkthrough:dev or npm run walkthrough:smoke.');
