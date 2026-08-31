// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { runExportJob, type ExportJobDeps } from '@/lib/export/queue';

function deps(overrides: Partial<ExportJobDeps> = {}): ExportJobDeps {
  return {
    claimRun: vi.fn(async () => true),
    finishRun: vi.fn(async () => {}),
    failRun: vi.fn(async () => {}),
    orgName: vi.fn(async () => 'Test Org'),
    writeArchiveToStorage: vi.fn(async () => ({
      manifestHash: 'a'.repeat(64), rowCount: 3, byteCount: 99,
      storagePath: 'org-1/export.tar',
    })),
    deletePartial: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runExportJob', () => {
  it('writes the archive and records the run when the claim succeeds', async () => {
    const d = deps();
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.writeArchiveToStorage).toHaveBeenCalled();
    expect(d.finishRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
      manifestHash: 'a'.repeat(64), rowCount: 3,
    }));
  });

  // A second worker taking the same job must do nothing at all.
  it('does no work when the claim is lost', async () => {
    const d = deps({ claimRun: vi.fn(async () => false) });
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.writeArchiveToStorage).not.toHaveBeenCalled();
    expect(d.finishRun).not.toHaveBeenCalled();
  });

  // A partial tar is worse than no tar: it looks like a download and is not one.
  it('deletes the partial object and records the reason when writing fails', async () => {
    const d = deps({
      writeArchiveToStorage: vi.fn(async () => { throw new Error('upload rejected'); }),
    });
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.deletePartial).toHaveBeenCalled();
    expect(d.failRun).toHaveBeenCalledWith('run-1', expect.stringContaining('upload rejected'));
    expect(d.finishRun).not.toHaveBeenCalled();
  });

  // A failure to clean up must not hide the failure that caused it.
  it('still records the failure when deleting the partial also fails', async () => {
    const d = deps({
      writeArchiveToStorage: vi.fn(async () => { throw new Error('upload rejected'); }),
      deletePartial: vi.fn(async () => { throw new Error('delete failed'); }),
    });
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    expect(d.failRun).toHaveBeenCalledWith('run-1', expect.stringContaining('upload rejected'));
  });

  it('sets an expiry a week out so retention has something to act on', async () => {
    const d = deps();
    await runExportJob({ runId: 'run-1', orgId: 'org-1' }, d);
    const call = (d.finishRun as ReturnType<typeof vi.fn>).mock.calls[0];
    const { expiresAt } = call[1] as { expiresAt: string };
    const days = (Date.parse(expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.5);
    expect(days).toBeLessThan(7.5);
  });
});
