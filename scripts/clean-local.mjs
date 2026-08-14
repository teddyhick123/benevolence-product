import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// Local outputs only. These paths are ignored by Git and can be regenerated.
const localOutputs = [
  '.next',
  '.next-walkthrough',
  'playwright-report',
  'test-results',
  'graphify-out',
  '.superpowers',
  'tsconfig.tsbuildinfo',
  '.DS_Store',
];

for (const output of localOutputs) {
  const target = resolve(output);
  if (!existsSync(target)) continue;

  rmSync(target, { force: true, recursive: true });
  console.log(`Removed ${output}`);
}

function removeMacMetadata(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;

    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      removeMacMetadata(target);
    } else if (entry.isFile() && entry.name === '.DS_Store') {
      rmSync(target, { force: true });
      console.log(`Removed ${target.slice(resolve('.').length + 1)}`);
    }
  }
}

removeMacMetadata(resolve('.'));
