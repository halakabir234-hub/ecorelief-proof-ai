/**
 * EcoRelief secret vault — optional, passphrase-encrypted persistence for a
 * role's 32-byte secret (applicant or verifier).
 *
 * Security model:
 *  - By default a secret lives only in memory for the lifetime of the page
 *    (see BrowserEcoReliefApplicantManager / BrowserEcoReliefVerifierManager).
 *    Nothing here is called unless the user explicitly opts in to save a
 *    recovery vault.
 *  - When saved, only an encrypted envelope (ciphertext + salt + IV +
 *    non-secret metadata) is ever written to localStorage. The passphrase and
 *    the AES key derived from it are never stored, logged, or returned to any
 *    caller — they exist only as local variables during a single
 *    encrypt/decrypt call and go out of scope when it returns.
 *  - Encryption is AES-256-GCM with a key derived via PBKDF2-SHA-256. The
 *    envelope's own metadata (version, role, kdf, iterations, createdAt) is
 *    authenticated as AES-GCM "additional data": changing any one of those
 *    fields in storage — including the role tag — invalidates the GCM
 *    authentication tag and makes decryption fail, even with the correct
 *    passphrase.
 *
 * Honest limitation: this protects the secret at rest (i.e. while the vault
 * is locked, or against someone who only has a copy of localStorage). It does
 * NOT protect against malicious same-origin JavaScript or an XSS payload
 * running while the vault is unlocked — at that point the decrypted secret is
 * in ordinary page memory, an in-page attacker can read it. There is no way
 * for client-side code alone to fully defend against a same-origin attacker;
 * defending against that is a content-security/XSS-prevention concern, not a
 * secret-storage concern, and is out of scope for this module.
 */

export type VaultRole = 'ecorelief-applicant' | 'ecorelief-verifier';

export const VAULT_VERSION = 1;
export const VAULT_KDF = 'PBKDF2-SHA-256';
/** OWASP (2023) minimum recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;

const SALT_BYTES = 16;
const IV_BYTES = 12;
/** AES-GCM appends a 16-byte authentication tag to the ciphertext. */
const GCM_TAG_BYTES = 16;

export class EcoReliefVaultError extends Error {}
export class EcoReliefWeakPassphraseError extends Error {}

export interface EncryptedVaultEnvelope {
  readonly version: typeof VAULT_VERSION;
  readonly role: VaultRole;
  readonly kdf: typeof VAULT_KDF;
  readonly iterations: number;
  readonly saltB64: string;
  readonly ivB64: string;
  readonly cipherB64: string;
  readonly createdAt: string;
}

// ── Small typed helpers (no `any`/`as any` anywhere in this module) ───────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value); // throws on malformed base64
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * Builds the deterministic, canonically-ordered "additional data" bytes used
 * to authenticate vault metadata under AES-GCM. The same five fields, in the
 * same order, must be used at both encryption and decryption time — any
 * difference (including a tampered `role`) makes the GCM tag check fail.
 */
function buildAssociatedData(meta: {
  readonly version: number;
  readonly role: VaultRole;
  readonly kdf: string;
  readonly iterations: number;
  readonly createdAt: string;
}): Uint8Array {
  const canonical = JSON.stringify({
    version: meta.version,
    role: meta.role,
    kdf: meta.kdf,
    iterations: meta.iterations,
    createdAt: meta.createdAt,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * Strictly validates an untrusted, parsed envelope BEFORE any PBKDF2 work is
 * attempted. Every field must match an exact, project-controlled constant
 * (version / kdf / iterations) or a narrow structural shape (role / salt
 * length / IV length / base64-decodability) — this is what stops a malformed
 * or attacker-supplied envelope from ever reaching (and forcing CPU work out
 * of) the key-derivation step.
 */
export function parseAndValidateEnvelope(raw: unknown): EncryptedVaultEnvelope {
  if (!isRecord(raw)) {
    throw new EcoReliefVaultError('Vault data is not a valid object.');
  }
  const { version, role, kdf, iterations, saltB64, ivB64, cipherB64, createdAt } = raw;

  if (typeof version !== 'number' || version !== VAULT_VERSION) {
    throw new EcoReliefVaultError(`Unsupported vault version (expected ${VAULT_VERSION}).`);
  }
  if (typeof role !== 'string' || (role !== 'ecorelief-applicant' && role !== 'ecorelief-verifier')) {
    throw new EcoReliefVaultError('Vault role is missing or invalid.');
  }
  if (typeof kdf !== 'string' || kdf !== VAULT_KDF) {
    throw new EcoReliefVaultError(`Unsupported key derivation function (expected ${VAULT_KDF}).`);
  }
  if (typeof iterations !== 'number' || iterations !== PBKDF2_ITERATIONS) {
    throw new EcoReliefVaultError(`Unsupported PBKDF2 iteration count (expected ${PBKDF2_ITERATIONS}).`);
  }
  if (typeof createdAt !== 'string' || createdAt.length === 0 || Number.isNaN(Date.parse(createdAt))) {
    throw new EcoReliefVaultError('Vault metadata is missing a valid creation timestamp.');
  }
  if (typeof saltB64 !== 'string' || saltB64.length === 0) {
    throw new EcoReliefVaultError('Vault salt is missing.');
  }
  if (typeof ivB64 !== 'string' || ivB64.length === 0) {
    throw new EcoReliefVaultError('Vault IV is missing.');
  }
  if (typeof cipherB64 !== 'string' || cipherB64.length === 0) {
    throw new EcoReliefVaultError('Vault ciphertext is missing.');
  }

  let salt: Uint8Array;
  let iv: Uint8Array;
  let cipher: Uint8Array;
  try {
    salt = decodeBase64(saltB64);
  } catch {
    throw new EcoReliefVaultError('Vault salt is not valid base64.');
  }
  try {
    iv = decodeBase64(ivB64);
  } catch {
    throw new EcoReliefVaultError('Vault IV is not valid base64.');
  }
  try {
    cipher = decodeBase64(cipherB64);
  } catch {
    throw new EcoReliefVaultError('Vault ciphertext is not valid base64.');
  }

  if (salt.length !== SALT_BYTES) {
    throw new EcoReliefVaultError(`Vault salt must decode to ${SALT_BYTES} bytes.`);
  }
  if (iv.length !== IV_BYTES) {
    throw new EcoReliefVaultError(`Vault IV must decode to ${IV_BYTES} bytes.`);
  }
  if (cipher.length <= GCM_TAG_BYTES) {
    throw new EcoReliefVaultError('Vault ciphertext is too short to be valid.');
  }

  return { version, role, kdf, iterations, saltB64, ivB64, cipherB64, createdAt };
}

export function assertPassphraseStrength(passphrase: string): void {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new EcoReliefWeakPassphraseError(
      `Recovery passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    );
  }
}

/**
 * Derives a non-extractable AES-256-GCM key via PBKDF2-SHA-256. Non-extractable
 * means the CryptoKey object can never be exported/serialized back out of Web
 * Crypto by any caller — it can only be used for encrypt/decrypt operations.
 * The iteration count is always this module's own constant, never a caller- or
 * storage-supplied value, so a tampered `iterations` field in stored data can
 * never influence the actual amount of PBKDF2 work performed.
 */
async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Generates a fresh, session-only secret. Never touches storage. */
export function generateSessionSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Best-effort in-memory clearing. Does not guarantee the underlying memory is scrubbed (JS/GC offer no such guarantee), but drops the recoverable byte values from this array immediately. */
export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}

export async function encryptSecretToVault(
  secret: Uint8Array,
  passphrase: string,
  role: VaultRole,
): Promise<EncryptedVaultEnvelope> {
  assertPassphraseStrength(passphrase);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const createdAt = new Date().toISOString();
  const key = await deriveAesKey(passphrase, salt);
  const additionalData = buildAssociatedData({
    version: VAULT_VERSION,
    role,
    kdf: VAULT_KDF,
    iterations: PBKDF2_ITERATIONS,
    createdAt,
  });
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource },
    key,
    secret as BufferSource,
  );
  return {
    version: VAULT_VERSION,
    role,
    kdf: VAULT_KDF,
    iterations: PBKDF2_ITERATIONS,
    saltB64: encodeBase64(salt),
    ivB64: encodeBase64(iv),
    cipherB64: encodeBase64(new Uint8Array(cipherBuffer)),
    createdAt,
  };
}

/**
 * Decrypts a vault envelope. Structural validation happens first (cheap,
 * before any PBKDF2 work). A role mismatch against the caller's expectation
 * is rejected before deriving key material; a tampered/rotated `role` (or
 * any other authenticated metadata field) still fails via the AES-GCM
 * authentication tag even when it happens to match the caller's expectation,
 * because the tag was computed over the *original* metadata at encrypt time.
 */
export async function decryptVaultToSecret(
  rawEnvelope: unknown,
  passphrase: string,
  expectedRole: VaultRole,
): Promise<Uint8Array> {
  const envelope = parseAndValidateEnvelope(rawEnvelope);
  if (envelope.role !== expectedRole) {
    throw new EcoReliefVaultError('This vault does not belong to the expected role.');
  }
  const salt = decodeBase64(envelope.saltB64);
  const iv = decodeBase64(envelope.ivB64);
  const cipher = decodeBase64(envelope.cipherB64);
  const key = await deriveAesKey(passphrase, salt);
  const additionalData = buildAssociatedData(envelope);
  try {
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: additionalData as BufferSource },
      key,
      cipher as BufferSource,
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new EcoReliefVaultError('Incorrect passphrase or corrupted vault data.');
  }
}

// ── Storage helpers — only ciphertext/salt/IV/metadata ever touch storage ──

export function hasVault(storageKey: string): boolean {
  return localStorage.getItem(storageKey) !== null;
}

export function loadVaultEnvelope(storageKey: string): EncryptedVaultEnvelope | null {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EcoReliefVaultError('Stored vault data is not valid JSON.');
  }
  return parseAndValidateEnvelope(parsed);
}

export function saveVaultEnvelope(storageKey: string, envelope: EncryptedVaultEnvelope): void {
  localStorage.setItem(storageKey, JSON.stringify(envelope));
}

export function clearVault(storageKey: string): void {
  localStorage.removeItem(storageKey);
}
