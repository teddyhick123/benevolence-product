// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  decryptAICredential,
  encryptAICredential,
  loadAICredentialKeyConfig,
} from '@/lib/ai/credential-crypto';

function key(byte: number) {
  return Buffer.alloc(32, byte).toString('base64');
}

function config() {
  return loadAICredentialKeyConfig({
    AI_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ old: key(1), current: key(2) }),
    AI_CREDENTIAL_ACTIVE_ENCRYPTION_KEY_ID: 'current',
    AI_CREDENTIAL_FINGERPRINT_KEYS: JSON.stringify({ fp1: key(3), fp2: key(4) }),
    AI_CREDENTIAL_ACTIVE_FINGERPRINT_KEY_ID: 'fp2',
  } as unknown as NodeJS.ProcessEnv);
}

describe('organization AI credential protection', () => {
  it('round trips a credential without including plaintext in the envelope or fingerprint', () => {
    const protectedValue = encryptAICredential(
      { apiKey: 'sk-or-secret-value' },
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    );

    expect(protectedValue).toMatchObject({
      encryptionKeyId: 'current',
      fingerprintKeyId: 'fp2',
    });
    expect(JSON.stringify(protectedValue)).not.toContain('sk-or-secret-value');
    expect(decryptAICredential(
      protectedValue.encryptedPayload,
      protectedValue.encryptionKeyId,
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    )).toEqual({ apiKey: 'sk-or-secret-value' });
  });

  it('authenticates organization and connection identity as associated data', () => {
    const protectedValue = encryptAICredential(
      { apiKey: 'sk-or-secret-value' },
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    );
    expect(() => decryptAICredential(
      protectedValue.encryptedPayload,
      protectedValue.encryptionKeyId,
      { orgId: 'org-b', connectionId: 'connection-a' },
      config(),
    )).toThrow('could not be authenticated');
  });

  it('detects ciphertext tampering', () => {
    const protectedValue = encryptAICredential(
      { apiKey: 'sk-or-secret-value' },
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    );
    const envelope = JSON.parse(protectedValue.encryptedPayload);
    envelope.ciphertext = `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`;
    expect(() => decryptAICredential(
      JSON.stringify(envelope),
      protectedValue.encryptionKeyId,
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    )).toThrow('could not be authenticated');
  });

  it('decrypts older envelopes while writing with the active key', () => {
    const oldConfig = {
      ...config(),
      activeEncryptionKeyId: 'old',
      activeFingerprintKeyId: 'fp1',
    };
    const oldValue = encryptAICredential(
      { apiKey: 'old-secret' },
      { orgId: 'org-a', connectionId: 'connection-a' },
      oldConfig,
    );
    expect(decryptAICredential(
      oldValue.encryptedPayload,
      oldValue.encryptionKeyId,
      { orgId: 'org-a', connectionId: 'connection-a' },
      config(),
    )).toEqual({ apiKey: 'old-secret' });
  });

  it('rejects reuse of encryption material as a fingerprint key', () => {
    expect(() => loadAICredentialKeyConfig({
      AI_CREDENTIAL_ENCRYPTION_KEYS: JSON.stringify({ v1: key(1) }),
      AI_CREDENTIAL_ACTIVE_ENCRYPTION_KEY_ID: 'v1',
      AI_CREDENTIAL_FINGERPRINT_KEYS: JSON.stringify({ v2: key(1) }),
      AI_CREDENTIAL_ACTIVE_FINGERPRINT_KEY_ID: 'v2',
    } as unknown as NodeJS.ProcessEnv)).toThrow('must be independent');
  });
});
