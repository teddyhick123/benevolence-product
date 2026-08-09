import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
  randomBytes,
} from 'node:crypto';

const ENVELOPE_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type AICredentialPayload = Readonly<Record<string, string>>;

export type AICredentialKeyConfig = Readonly<{
  encryptionKeys: Readonly<Record<string, Buffer>>;
  activeEncryptionKeyId: string;
  fingerprintKeys: Readonly<Record<string, Buffer>>;
  activeFingerprintKeyId: string;
}>;

export type EncryptedAICredential = Readonly<{
  encryptedPayload: string;
  encryptionKeyId: string;
  secretFingerprint: string;
  fingerprintKeyId: string;
}>;

type CredentialEnvelope = {
  v: 1;
  keyId: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
}
function associatedData(orgId: string, connectionId: string): Buffer {
  return Buffer.from(
    canonicalize({ purpose: 'org-ai-credential', version: ENVELOPE_VERSION, orgId, connectionId }),
    'utf8',
  );
}

function decodeKey(value: string, name: string): Buffer {
  const encoded = value.trim();
  const key = /^[0-9a-f]{64}$/i.test(encoded)
    ? Buffer.from(encoded, 'hex')
    : Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must contain exactly 32 bytes encoded as base64 or 64 hexadecimal characters`);
  }
  return key;
}

function parseKeyRing(raw: string | undefined, name: string): Record<string, Buffer> {
  if (!raw) throw new Error(`${name} is required`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON object keyed by key id`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object keyed by key id`);
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error(`${name} must contain at least one key`);
  return Object.fromEntries(entries.map(([id, value]) => {
    if (!id.trim() || typeof value !== 'string') {
      throw new Error(`${name} contains an invalid key entry`);
    }
    return [id, decodeKey(value, `${name}.${id}`)];
  }));
}

export function loadAICredentialKeyConfig(
  env: NodeJS.ProcessEnv = process.env,
): AICredentialKeyConfig {
  const encryptionKeys = parseKeyRing(
    env.AI_CREDENTIAL_ENCRYPTION_KEYS,
    'AI_CREDENTIAL_ENCRYPTION_KEYS',
  );
  const fingerprintKeys = parseKeyRing(
    env.AI_CREDENTIAL_FINGERPRINT_KEYS,
    'AI_CREDENTIAL_FINGERPRINT_KEYS',
  );
  const activeEncryptionKeyId = env.AI_CREDENTIAL_ACTIVE_ENCRYPTION_KEY_ID?.trim();
  const activeFingerprintKeyId = env.AI_CREDENTIAL_ACTIVE_FINGERPRINT_KEY_ID?.trim();
  if (!activeEncryptionKeyId || !encryptionKeys[activeEncryptionKeyId]) {
    throw new Error('AI_CREDENTIAL_ACTIVE_ENCRYPTION_KEY_ID must identify a configured encryption key');
  }
  if (!activeFingerprintKeyId || !fingerprintKeys[activeFingerprintKeyId]) {
    throw new Error('AI_CREDENTIAL_ACTIVE_FINGERPRINT_KEY_ID must identify a configured fingerprint key');
  }
  for (const encryptionKey of Object.values(encryptionKeys)) {
    for (const fingerprintKey of Object.values(fingerprintKeys)) {
      if (timingSafeEqual(encryptionKey, fingerprintKey)) {
        throw new Error('AI credential encryption and fingerprint key material must be independent');
      }
    }
  }
  return {
    encryptionKeys,
    activeEncryptionKeyId,
    fingerprintKeys,
    activeFingerprintKeyId,
  };
}

export function encryptAICredential(
  payload: AICredentialPayload,
  scope: { orgId: string; connectionId: string },
  config: AICredentialKeyConfig = loadAICredentialKeyConfig(),
): EncryptedAICredential {
  const plaintext = Buffer.from(canonicalize(payload), 'utf8');
  const key = config.encryptionKeys[config.activeEncryptionKeyId];
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(scope.orgId, scope.connectionId));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: CredentialEnvelope = {
    v: ENVELOPE_VERSION,
    keyId: config.activeEncryptionKeyId,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  const fingerprint = createHmac(
    'sha256',
    config.fingerprintKeys[config.activeFingerprintKeyId],
  ).update(plaintext).digest('hex');
  return {
    encryptedPayload: JSON.stringify(envelope),
    encryptionKeyId: config.activeEncryptionKeyId,
    secretFingerprint: fingerprint,
    fingerprintKeyId: config.activeFingerprintKeyId,
  };
}

export function decryptAICredential(
  encryptedPayload: string,
  encryptionKeyId: string,
  scope: { orgId: string; connectionId: string },
  config: AICredentialKeyConfig = loadAICredentialKeyConfig(),
): AICredentialPayload {
  let envelope: CredentialEnvelope;
  try {
    envelope = JSON.parse(encryptedPayload) as CredentialEnvelope;
  } catch {
    throw new Error('AI credential envelope is invalid');
  }
  if (
    envelope.v !== ENVELOPE_VERSION
    || envelope.keyId !== encryptionKeyId
    || !envelope.iv
    || !envelope.tag
    || !envelope.ciphertext
  ) {
    throw new Error('AI credential envelope is invalid');
  }
  const key = config.encryptionKeys[encryptionKeyId];
  if (!key) throw new Error(`AI credential encryption key ${encryptionKeyId} is unavailable`);
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64url'),
    );
    decipher.setAAD(associatedData(scope.orgId, scope.connectionId));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(plaintext) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    return payload as AICredentialPayload;
  } catch {
    throw new Error('AI credential could not be authenticated or decrypted');
  }
}
