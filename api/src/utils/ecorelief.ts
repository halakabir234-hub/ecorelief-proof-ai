/**
 * Utility functions for the EcoRelief API.
 * @module
 */

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
