import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSessionSecret,
  encryptSecretToVault,
  decryptVaultToSecret,
  parseAndValidateEnvelope,
  assertPassphraseStrength,
  zeroize,
  hasVault,
  loadVaultEnvelope,
  saveVaultEnvelope,
  clearVault,
  EcoReliefVaultError,
  EcoReliefWeakPassphraseError,
  VAULT_VERSION,
  VAULT_KDF,
  PBKDF2_ITERATIONS,
  MIN_PASSPHRASE_LENGTH,
  type EncryptedVaultEnvelope,
  type VaultRole,
} from './secret-vault';

const GOOD_PASSPHRASE = 'correct horse battery staple';
const OTHER_PASSPHRASE = 'wrong horse battery staple!!';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function makeEnvelope(role: VaultRole = 'ecorelief-applicant', secret = generateSessionSecret()) {
  const envelope = await encryptSecretToVault(secret, GOOD_PASSPHRASE, role);
  return { secret, envelope };
}

describe('generateSessionSecret', () => {
  it('produces 32 random bytes, different each call', () => {
    const a = generateSessionSecret();
    const b = generateSessionSecret();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});

describe('assertPassphraseStrength', () => {
  it('rejects passphrases shorter than the minimum length', () => {
    expect(() => assertPassphraseStrength('a'.repeat(MIN_PASSPHRASE_LENGTH - 1))).toThrow(EcoReliefWeakPassphraseError);
  });

  it('accepts a passphrase exactly at the minimum length', () => {
    expect(() => assertPassphraseStrength('a'.repeat(MIN_PASSPHRASE_LENGTH))).not.toThrow();
  });
});

describe('encryptSecretToVault / decryptVaultToSecret round trip', () => {
  it('restores the exact original secret with the correct passphrase', async () => {
    const secret = generateSessionSecret();
    const envelope = await encryptSecretToVault(secret, GOOD_PASSPHRASE, 'ecorelief-applicant');
    const restored = await decryptVaultToSecret(envelope, GOOD_PASSPHRASE, 'ecorelief-applicant');
    expect(bytesToHex(restored)).toBe(bytesToHex(secret));
  });

  it('rejects saving a vault with a weak passphrase', async () => {
    const secret = generateSessionSecret();
    await expect(encryptSecretToVault(secret, 'short', 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefWeakPassphraseError,
    );
  });

  // ── Requirement: stored data does not contain the raw secret or passphrase ──
  it('the stored envelope JSON contains neither the raw secret nor the passphrase', async () => {
    const secret = generateSessionSecret();
    const { envelope } = await makeEnvelope('ecorelief-applicant', secret);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain(bytesToHex(secret));
    expect(serialized).not.toContain(GOOD_PASSPHRASE);
    // structurally, the envelope type itself has no field capable of holding either
    expect(Object.keys(envelope).sort()).toEqual(
      ['version', 'role', 'kdf', 'iterations', 'saltB64', 'ivB64', 'cipherB64', 'createdAt'].sort(),
    );
  });

  // ── Requirement: wrong passphrase fails safely ──
  it('fails with a clear error on the wrong passphrase, without returning any data', async () => {
    const { envelope } = await makeEnvelope();
    await expect(decryptVaultToSecret(envelope, OTHER_PASSPHRASE, 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  // ── Requirement: tampered ciphertext fails authentication ──
  it('fails when a single byte of the ciphertext is flipped', async () => {
    const { envelope } = await makeEnvelope();
    const cipherBytes = Uint8Array.from(atob(envelope.cipherB64), (c) => c.charCodeAt(0));
    cipherBytes[0] ^= 0xff;
    const tampered: EncryptedVaultEnvelope = {
      ...envelope,
      cipherB64: btoa(String.fromCharCode(...cipherBytes)),
    };
    await expect(decryptVaultToSecret(tampered, GOOD_PASSPHRASE, 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  it('fails when the IV is altered', async () => {
    const { envelope } = await makeEnvelope();
    const ivBytes = Uint8Array.from(atob(envelope.ivB64), (c) => c.charCodeAt(0));
    ivBytes[0] ^= 0xff;
    const tampered: EncryptedVaultEnvelope = { ...envelope, ivB64: btoa(String.fromCharCode(...ivBytes)) };
    await expect(decryptVaultToSecret(tampered, GOOD_PASSPHRASE, 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  // ── Requirement: salt and IV are independently random ──
  it('generates a fresh, independent salt and IV on every save', async () => {
    const secret = generateSessionSecret();
    const envelopeA = await encryptSecretToVault(secret, GOOD_PASSPHRASE, 'ecorelief-applicant');
    const envelopeB = await encryptSecretToVault(secret, GOOD_PASSPHRASE, 'ecorelief-applicant');
    expect(envelopeA.saltB64).not.toBe(envelopeB.saltB64);
    expect(envelopeA.ivB64).not.toBe(envelopeB.ivB64);
  });

  // ── Requirement: authenticated metadata (AAD) — changing role fails authentication ──
  it('fails authentication when the envelope role is changed, even to a structurally valid role matching the caller expectation', async () => {
    const { envelope } = await makeEnvelope('ecorelief-applicant');
    const tampered: EncryptedVaultEnvelope = { ...envelope, role: 'ecorelief-verifier' };
    // Call decrypt with expectedRole matching the *tampered* value, isolating the
    // AAD authentication mechanism from the separate expectedRole equality check.
    await expect(decryptVaultToSecret(tampered, GOOD_PASSPHRASE, 'ecorelief-verifier')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  it('fails when createdAt is changed to a different, still-valid timestamp', async () => {
    const { envelope } = await makeEnvelope();
    const tampered: EncryptedVaultEnvelope = { ...envelope, createdAt: new Date(0).toISOString() };
    await expect(decryptVaultToSecret(tampered, GOOD_PASSPHRASE, 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  // ── Requirement: applicant and verifier vaults cannot be confused ──
  it('refuses to unlock an applicant vault as a verifier vault (correct passphrase, wrong expected role)', async () => {
    const { envelope } = await makeEnvelope('ecorelief-applicant');
    await expect(decryptVaultToSecret(envelope, GOOD_PASSPHRASE, 'ecorelief-verifier')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });

  it('refuses to unlock a verifier vault as an applicant vault', async () => {
    const { envelope } = await makeEnvelope('ecorelief-verifier');
    await expect(decryptVaultToSecret(envelope, GOOD_PASSPHRASE, 'ecorelief-applicant')).rejects.toBeInstanceOf(
      EcoReliefVaultError,
    );
  });
});

describe('parseAndValidateEnvelope — rejects malformed/tampered input before any PBKDF2 work', () => {
  let valid: EncryptedVaultEnvelope;

  beforeEach(async () => {
    valid = await encryptSecretToVault(generateSessionSecret(), GOOD_PASSPHRASE, 'ecorelief-applicant');
  });

  it('accepts a well-formed envelope', () => {
    expect(() => parseAndValidateEnvelope(valid)).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => parseAndValidateEnvelope('not an object')).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope(null)).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope(undefined)).toThrow(EcoReliefVaultError);
  });

  it('rejects an unsupported version', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, version: VAULT_VERSION + 1 })).toThrow(EcoReliefVaultError);
  });

  it('rejects an unsupported KDF identifier', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, kdf: 'PBKDF2-SHA-1' })).toThrow(EcoReliefVaultError);
  });

  it('rejects an iteration count other than the exact approved constant (both lower and higher)', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, iterations: 1 })).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope({ ...valid, iterations: PBKDF2_ITERATIONS * 1000 })).toThrow(
      EcoReliefVaultError,
    );
  });

  it('rejects an invalid role', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, role: 'admin' })).toThrow(EcoReliefVaultError);
  });

  it('rejects a missing or invalid createdAt', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, createdAt: 'not-a-date' })).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope({ ...valid, createdAt: '' })).toThrow(EcoReliefVaultError);
  });

  it('rejects malformed base64 in salt/IV/ciphertext', () => {
    expect(() => parseAndValidateEnvelope({ ...valid, saltB64: '***not-base64***' })).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope({ ...valid, ivB64: '***not-base64***' })).toThrow(EcoReliefVaultError);
    expect(() => parseAndValidateEnvelope({ ...valid, cipherB64: '***not-base64***' })).toThrow(EcoReliefVaultError);
  });

  it('rejects a salt that does not decode to exactly 16 bytes', () => {
    const shortSalt = btoa(String.fromCharCode(...new Uint8Array(8)));
    expect(() => parseAndValidateEnvelope({ ...valid, saltB64: shortSalt })).toThrow(EcoReliefVaultError);
  });

  it('rejects an IV that does not decode to exactly 12 bytes', () => {
    const shortIv = btoa(String.fromCharCode(...new Uint8Array(4)));
    expect(() => parseAndValidateEnvelope({ ...valid, ivB64: shortIv })).toThrow(EcoReliefVaultError);
  });

  it('rejects ciphertext too short to contain a GCM auth tag', () => {
    const tooShort = btoa(String.fromCharCode(...new Uint8Array(4)));
    expect(() => parseAndValidateEnvelope({ ...valid, cipherB64: tooShort })).toThrow(EcoReliefVaultError);
  });
});

describe('storage helpers — only ciphertext/salt/IV/metadata ever touch localStorage', () => {
  const KEY = 'test-ecorelief-vault';

  beforeEach(() => {
    localStorage.clear();
  });

  it('hasVault reflects presence/absence correctly', async () => {
    expect(hasVault(KEY)).toBe(false);
    const envelope = await encryptSecretToVault(generateSessionSecret(), GOOD_PASSPHRASE, 'ecorelief-applicant');
    saveVaultEnvelope(KEY, envelope);
    expect(hasVault(KEY)).toBe(true);
    clearVault(KEY);
    expect(hasVault(KEY)).toBe(false);
  });

  it('loadVaultEnvelope round-trips what saveVaultEnvelope wrote', async () => {
    const secret = generateSessionSecret();
    const envelope = await encryptSecretToVault(secret, GOOD_PASSPHRASE, 'ecorelief-verifier');
    saveVaultEnvelope(KEY, envelope);
    const loaded = loadVaultEnvelope(KEY);
    expect(loaded).toEqual(envelope);
  });

  it('the raw localStorage value never contains the secret or passphrase', async () => {
    const secret = generateSessionSecret();
    const envelope = await encryptSecretToVault(secret, GOOD_PASSPHRASE, 'ecorelief-applicant');
    saveVaultEnvelope(KEY, envelope);
    const raw = localStorage.getItem(KEY) ?? '';
    expect(raw).not.toContain(bytesToHex(secret));
    expect(raw).not.toContain(GOOD_PASSPHRASE);
  });

  it('returns null when nothing is stored', () => {
    expect(loadVaultEnvelope(KEY)).toBeNull();
  });
});

describe('zeroize', () => {
  it('overwrites every byte with zero', () => {
    const bytes = generateSessionSecret();
    zeroize(bytes);
    expect(Array.from(bytes).every((b) => b === 0)).toBe(true);
  });
});
