/**
 * Runtime validation for environment/wallet-supplied configuration.
 *
 * These values (the network ID env var, the connected Lace wallet's own
 * configuration, and any contract address) are treated as untrusted input
 * even though most of them come from local `.env` files or the user's own
 * wallet — a misconfigured `.env`, a misconfigured Lace network, or a
 * malformed pasted address should all fail loudly and specifically here,
 * rather than surfacing as a confusing downstream provider/proof error or
 * (worse) silently proceeding with a `!` non-null assertion.
 */

export class EcoReliefConfigError extends Error {}

/** This project only ever targets Preprod — not merely "any non-empty string". */
export type ValidatedNetworkId = 'preprod';

export function assertValidNetworkId(value: unknown): asserts value is ValidatedNetworkId {
  if (value !== 'preprod') {
    const shown = typeof value === 'string' ? JSON.stringify(value) : String(value);
    throw new EcoReliefConfigError(
      `VITE_NETWORK_ID must be exactly "preprod" for this project — got ${shown}. Check your .env file.`,
    );
  }
}

export interface ValidatedWalletConfig {
  readonly indexerUri: string;
  readonly indexerWsUri: string;
  readonly proverServerUri: string;
}

function assertUrlWithProtocol(value: unknown, protocol: 'https:' | 'wss:', fieldLabel: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EcoReliefConfigError(`Lace did not return a ${fieldLabel} — check Lace's network settings.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EcoReliefConfigError(`Lace returned a malformed ${fieldLabel}: ${value}`);
  }
  if (parsed.protocol !== protocol) {
    throw new EcoReliefConfigError(`${fieldLabel} must use ${protocol} — got ${parsed.protocol} (${value})`);
  }
}

/**
 * Validates the wallet's own `getConfiguration()` result. Replaces the
 * pattern of reading `config.proverServerUri!` (a non-null assertion over a
 * field the wallet SDK itself types as optional) with an explicit runtime
 * check and a clear, actionable error message.
 */
export function assertValidWalletConfig(config: {
  readonly indexerUri?: string;
  readonly indexerWsUri?: string;
  readonly proverServerUri?: string;
}): asserts config is ValidatedWalletConfig {
  assertUrlWithProtocol(config.indexerUri, 'https:', 'indexer URL');
  assertUrlWithProtocol(config.indexerWsUri, 'wss:', 'indexer websocket URL');
  assertUrlWithProtocol(config.proverServerUri, 'https:', 'proof server URL');
}

const CONTRACT_ADDRESS_PATTERN = /^[0-9a-fA-F]{64}$/;

export function assertValidContractAddress(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !CONTRACT_ADDRESS_PATTERN.test(value)) {
    throw new EcoReliefConfigError('Contract address must be exactly 64 hexadecimal characters.');
  }
}

/** Non-throwing variant for validating optional/env-supplied addresses at startup, where a malformed value should be logged and ignored rather than crash the app. */
export function isValidContractAddress(value: unknown): value is string {
  return typeof value === 'string' && CONTRACT_ADDRESS_PATTERN.test(value);
}
