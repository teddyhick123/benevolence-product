import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';

type AcknowledgmentPdfScope = Pick<OrgAccessContext, 'orgId'>;

/** Private acknowledgment document storage constrained to one authorized org. */
export function createAcknowledgmentPdfRepository(scope: AcknowledgmentPdfScope) {
  const storage = createElevatedClient().storage.from('documents');

  function pathFor(letterId: string) {
    return `acknowledgments/${scope.orgId}/${letterId}.pdf`;
  }

  return {
    pathFor,

    async upload(letterId: string, pdf: Buffer) {
      const storagePath = pathFor(letterId);
      const { error } = await storage.upload(storagePath, pdf, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return storagePath;
    },

    async remove(letterId: string) {
      return storage.remove([pathFor(letterId)]);
    },

    async createSignedUrl(letterId: string) {
      const { data, error } = await storage.createSignedUrl(pathFor(letterId), 3600);
      if (error || !data) throw new Error('Failed to create download URL');
      return data.signedUrl;
    },
  };
}
