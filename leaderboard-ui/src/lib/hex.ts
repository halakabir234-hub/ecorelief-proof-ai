/** Minimal hex <-> bytes helpers for the EcoRelief test-harness forms. */

export function hexToBytes(hex: string, expectedLength?: number): Uint8Array {
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]*$/.test(trimmed) || trimmed.length % 2 !== 0) {
    throw new Error('Value must be a hex string with an even number of characters.');
  }
  const bytes = new Uint8Array(trimmed.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(trimmed.substring(i * 2, i * 2 + 2), 16);
  }
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new Error(`Value must be exactly ${expectedLength} bytes (${expectedLength * 2} hex characters).`);
  }
  return bytes;
}
