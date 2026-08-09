import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import {
  decryptAICredential,
  encryptAICredential,
  type AICredentialKeyConfig,
  type AICredentialPayload,
} from '@/lib/ai/credential-crypto';
import { openRouterCredentialSchema } from '@/lib/schemas/ai-settings';

type AICredentialScope = {
  orgId: string;
  actorId?: string;
};

type CredentialDependencies = {
  db?: ElevatedClient;
  keyConfig?: AICredentialKeyConfig;
};

function displayHint(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`;
}

/**
 * Service-only credential capability. Decrypted material is available only
 * inside withCredential's callback and is never returned as a database row.
 */
export function createAICredentialRepository(
  scope: AICredentialScope,
  dependencies: CredentialDependencies = {},
) {
  const db = dependencies.db ?? createElevatedClient();

  async function connection(connectionId: string) {
    const { data, error } = await db
      .from('org_ai_connections')
      .select('id, connector')
      .eq('id', connectionId)
      .eq('org_id', scope.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('AI connection not found');
    return data;
  }

  function validate(connector: string, input: unknown): AICredentialPayload {
    if (connector === 'openrouter') return openRouterCredentialSchema.parse(input);
    throw new Error(`Unsupported organization AI connector: ${connector}`);
  }

  return {
    async setCredential(connectionId: string, input: unknown) {
      if (!scope.actorId) throw new Error('Credential mutation requires an authenticated actor');
      const target = await connection(connectionId);
      const payload = validate(target.connector, input);
      const encrypted = encryptAICredential(
        payload,
        { orgId: scope.orgId, connectionId },
        dependencies.keyConfig,
      );
      const hint = displayHint(payload.apiKey);
      const now = new Date().toISOString();
      const { data: existing, error: readError } = await db
        .from('org_ai_credentials')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (readError) throw readError;

      const values = {
        encrypted_payload: encrypted.encryptedPayload,
        encryption_key_id: encrypted.encryptionKeyId,
        secret_fingerprint: encrypted.secretFingerprint,
        fingerprint_key_id: encrypted.fingerprintKeyId,
        display_hint: hint,
        rotated_at: existing ? now : null,
      };
      const result = existing
        ? await db.from('org_ai_credentials').update(values)
          .eq('id', existing.id).eq('org_id', scope.orgId)
        : await db.from('org_ai_credentials').insert({
          ...values,
          org_id: scope.orgId,
          connection_id: connectionId,
          created_by: scope.actorId,
        });
      if (result.error) throw result.error;

      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        actor_subject_id: scope.actorId,
        action: existing ? 'ai.credential_rotated' : 'ai.credential_created',
        target_id: connectionId,
        metadata: { connector: target.connector },
      });
      if (auditError) throw auditError;
      return { displayHint: hint, rotatedAt: existing ? now : null };
    },

    async hasCredential(connectionId: string): Promise<boolean> {
      const { data, error } = await db
        .from('org_ai_credentials')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },

    async listCredentialHints() {
      const { data, error } = await db
        .from('org_ai_credentials')
        .select('connection_id, display_hint, rotated_at, updated_at')
        .eq('org_id', scope.orgId);
      if (error) throw error;
      return (data ?? []).map(row => ({
        connectionId: row.connection_id,
        displayHint: row.display_hint,
        rotatedAt: row.rotated_at,
        updatedAt: row.updated_at,
      }));
    },

    async withCredential<T>(
      connectionId: string,
      executeWith: (_credential: AICredentialPayload) => Promise<T> | T,
    ): Promise<T> {
      const target = await connection(connectionId);
      const { data, error } = await db
        .from('org_ai_credentials')
        .select('encrypted_payload, encryption_key_id')
        .eq('org_id', scope.orgId)
        .eq('connection_id', connectionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('AI connection credential is missing');
      const decrypted = decryptAICredential(
        data.encrypted_payload,
        data.encryption_key_id,
        { orgId: scope.orgId, connectionId },
        dependencies.keyConfig,
      );
      return executeWith(validate(target.connector, decrypted));
    },
  };
}

export type AICredentialRepository = ReturnType<typeof createAICredentialRepository>;
