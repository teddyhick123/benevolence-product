import { describe, expect, it } from 'vitest';
import { AI_MODELS } from '@/lib/ai/models';
import { AI_WORKLOADS } from '@/lib/ai/workloads';

describe('AI workload registry', () => {
  it('declares stable, internally consistent workload definitions', () => {
    for (const [id, workload] of Object.entries(AI_WORKLOADS)) {
      expect(workload.id).toBe(id);
      expect(workload.requiredCapabilities.length).toBeGreaterThan(0);
      expect(workload.defaultLimits.timeoutMs).toBeGreaterThan(0);
      expect(workload.platformDefault.model.length).toBeGreaterThan(0);
    }
  });

  it('preserves the current platform Anthropic model for text workloads', () => {
    for (const workload of Object.values(AI_WORKLOADS)) {
      if (workload.platformDefault.connector === 'anthropic') {
        expect(workload.platformDefault.model).toBe(AI_MODELS.assistant);
      }
    }
  });

  it('keeps transcription explicitly platform-only', () => {
    expect(AI_WORKLOADS.transcription.platformDefault.connector).toBe(
      'transcription_platform',
    );
  });
});
