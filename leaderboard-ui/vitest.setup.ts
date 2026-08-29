// jsdom does not implement SubtleCrypto; Node's own Web Crypto implementation
// does. Swap it in so secret-vault.ts's crypto.subtle calls work under tests.
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}
