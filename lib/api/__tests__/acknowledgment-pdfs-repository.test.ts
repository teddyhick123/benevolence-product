// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAcknowledgmentPdfRepository } from '@/lib/api/repositories/acknowledgment-pdfs';

const {
  mockCreateElevatedClient,
  mockStorageFrom,
  mockUpload,
  mockRemove,
  mockCreateSignedUrl,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ storage: { from: mockStorageFrom } });
  mockStorageFrom.mockReturnValue({
    upload: mockUpload,
    remove: mockRemove,
    createSignedUrl: mockCreateSignedUrl,
  });
  mockUpload.mockResolvedValue({ data: {}, error: null });
  mockRemove.mockResolvedValue({ data: {}, error: null });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/document' },
    error: null,
  });
});

describe('createAcknowledgmentPdfRepository', () => {
  it('forces every storage operation under the authorized organization path', async () => {
    const repository = createAcknowledgmentPdfRepository({ orgId: 'org-1' });
    const pdf = Buffer.from('pdf');

    const path = await repository.upload('letter-1', pdf);
    await repository.remove('letter-1', path);
    const signedUrl = await repository.createSignedUrl(path);

    expect(mockStorageFrom).toHaveBeenCalledWith('documents');
    expect(path).toMatch(/^acknowledgments\/org-1\/letter-1\/[0-9a-f-]+\.pdf$/);
    expect(mockUpload).toHaveBeenCalledWith(
      path,
      pdf,
      { contentType: 'application/pdf', upsert: false }
    );
    expect(mockRemove).toHaveBeenCalledWith([path]);
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      path,
      3600
    );
    expect(signedUrl).toBe('https://signed.example/document');
  });

  it('does not expose the elevated client or generic storage access', () => {
    const repository = createAcknowledgmentPdfRepository({ orgId: 'org-1' });
    expect(repository).not.toHaveProperty('storage');
    expect(repository).not.toHaveProperty('db');
  });

  it('refuses to retire a path outside the authorized letter scope', async () => {
    const repository = createAcknowledgmentPdfRepository({ orgId: 'org-1' });
    await expect(repository.remove('letter-1', 'acknowledgments/org-2/letter-1/old.pdf'))
      .rejects.toThrow(/outside the authorized letter scope/i);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
