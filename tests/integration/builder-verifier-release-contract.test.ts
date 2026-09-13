import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('Builder verifier release contract', () => {
  it('publishes only a main-built image and hands off its digest', () => {
    const workflow = read('.github/workflows/publish-builder-verifier.yml');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain('packages: write');
    expect(workflow).toContain('docker/build-push-action@v6');
    expect(workflow).toContain('push: true');
    expect(workflow).toContain('steps.build.outputs.digest');
    expect(workflow).toContain('BUILDER_VERIFIER_IMAGE');
  });

  it('pins the image base and documents the production worker boundary', () => {
    expect(read('docker/builder-verifier/Dockerfile'))
      .toMatch(/ARG NODE_IMAGE=node:20-bookworm-slim@sha256:[a-f0-9]{64}/);
    expect(read('docker/builder-verifier/Dockerfile')).toContain('npm ci --legacy-peer-deps');
    const operations = read('docs/engineering/BUILDER_OPERATIONS.md');
    expect(operations).toContain('Publish Builder Verifier');
    expect(operations).toContain('fetchable `origin`');
    expect(operations).toContain('Migration-touching proposals remain intentionally blocked');
  });
});
