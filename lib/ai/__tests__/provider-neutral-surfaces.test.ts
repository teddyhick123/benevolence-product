import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

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
  'lib/onboarding-assistant.ts',
  'lib/import/ai/client.ts',
  'lib/ai/document-extractor.ts',
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
});
