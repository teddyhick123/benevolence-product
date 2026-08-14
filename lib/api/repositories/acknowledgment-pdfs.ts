import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { randomUUID } from 'crypto';

type AcknowledgmentPdfScope = Pick<OrgAccessContext, 'orgId'>;

/** Private acknowledgment document storage constrained to one authorized org. */
export function createAcknowledgmentPdfRepository(scope: AcknowledgmentPdfScope) {
  const storage = createElevatedClient().storage.from('documents');

  function pathPrefix(letterId: string) {
    return `acknowledgments/${scope.orgId}/${letterId}/`;
  }

  function pathFor(letterId: string, version: string = randomUUID()) {
    return `${pathPrefix(letterId)}${version}.pdf`;
  }

  function isScopedPath(letterId: string, storagePath: string | null | undefined): storagePath is string {
    return typeof storagePath === 'string' && storagePath.startsWith(pathPrefix(letterId));
  }

  return {
    pathFor,

    async upload(letterId: string, pdf: Buffer) {
      const storagePath = pathFor(letterId);
      const { error } = await storage.upload(storagePath, pdf, {
        contentType: 'application/pdf',
        upsert: false,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return storagePath;
    },

    async remove(letterId: string, storagePath: string) {
      if (!isScopedPath(letterId, storagePath)) {
        throw new Error('Acknowledgment storage path is outside the authorized letter scope');
      }
      return storage.remove([storagePath]);
    },

    async createSignedUrl(storagePath: string) {
      const { data, error } = await storage.createSignedUrl(storagePath, 3600);
      if (error || !data) throw new Error('Failed to create download URL');
      return data.signedUrl;
    },

    isScopedPath,
  };
}
