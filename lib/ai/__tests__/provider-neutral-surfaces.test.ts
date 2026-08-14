import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const providerNeutralFiles = [
  'app/api/onboarding/assist/route.ts',
  'app/api/onboarding/chat/route.ts',
  'app/api/onboarding/recommendations/route.ts',
  'app/api/portfolio/[id]/summary/route.ts',
  'app/api/portfolio/[id]/letter/generate/route.ts',
  'app/api/holdings/[id]/financial-profile/generate/route.ts',
  'app/api/ai/transcribe/route.ts',
  'app/api/admin/upload/route.ts',
  'app/api/admin/upload/ingest/route.ts',
  'lib/onboarding/assistant.ts',
  'lib/ai/assistant/portfolio-assistant.ts',
  'lib/import/ai/client.ts',
  'lib/ai/document-extractor.ts',
];

function implementationFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return implementationFiles(file);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

const clientFacingRuntimeFiles = [
  ...implementationFiles('app/api').filter(
    (file) => file.endsWith('/route.ts') && !file.includes('/builder/') && !file.includes('/constructor/'),
  ),
  ...implementationFiles('lib/ai/assistant'),
  ...implementationFiles('lib/import/ai'),
  'lib/onboarding/assistant.ts',
  'lib/ai/document-extractor.ts',
  'lib/ai/transcription.ts',
];

describe('provider-neutral AI surfaces', () => {
  it.each(providerNeutralFiles)('%s does not instantiate provider SDKs directly', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/from ['"]@anthropic-ai\/sdk['"]/);
    expect(src).not.toMatch(/from ['"]openai['"]/);
    expect(src).not.toMatch(/new Anthropic\(/);
    expect(src).not.toMatch(/new OpenAI\(/);
  });

  it.each(providerNeutralFiles)('%s does not require provider-specific API key checks', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toContain('ANTHROPIC_API_KEY');
    expect(src).not.toContain('OPENAI_API_KEY');
  });

  it.each(providerNeutralFiles)('%s does not select providers or raw models', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toContain('createAIProvider');
    expect(src).not.toContain('AI_MODELS');
  });

  it('keeps provider and raw-model selection out of all client-facing AI surfaces', () => {
    const offenders = clientFacingRuntimeFiles.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return [
        'createAIProvider',
        'AI_MODELS',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        "from '@anthropic-ai/sdk'",
        'from "@anthropic-ai/sdk"',
        "from 'openai'",
        'from "openai"',
      ].some((token) => src.includes(token));
    });
    expect(offenders).toEqual([]);
  });
});
