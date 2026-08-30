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

/**
 * This project targets Preprod or a local "undeployed" standalone network
 * (node + indexer + proof server run via Docker on localhost) — not merely
 * "any non-empty string". 'undeployed' is the Midnight SDK's own documented
 * default/local-network identifier (see @midnight-ntwrk/midnight-js-network-id).
 */
export type ValidatedNetworkId = 'preprod' | 'undeployed';

export function assertValidNetworkId(value: unknown): asserts value is ValidatedNetworkId {
  if (value !== 'preprod' && value !== 'undeployed') {
    const shown = typeof value === 'string' ? JSON.stringify(value) : String(value);
    throw new EcoReliefConfigError(
      `Network ID must be "preprod" or "undeployed" — got ${shown}. Check your .env file.`,
    );
  }
}

export interface ValidatedWalletConfig {
  readonly indexerUri: string;
  readonly indexerWsUri: string;
  readonly proverServerUri: string;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Requires `secureProtocol` (https:/wss:) everywhere, except on loopback
 * hosts (localhost/127.0.0.1/::1) where the plain `insecureProtocol`
 * (http:/ws:) is also accepted — the local "undeployed" Docker network
 * (node/indexer/proof server) is only ever reachable over plain HTTP/WS.
 * Preprod/production endpoints are never loopback, so this never weakens
 * the check for them.
 */
function assertUrlWithProtocol(
  value: unknown,
  secureProtocol: 'https:' | 'wss:',
  insecureProtocol: 'http:' | 'ws:',
  fieldLabel: string,
): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new EcoReliefConfigError(`Lace did not return a ${fieldLabel} — check Lace's network settings.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new EcoReliefConfigError(`Lace returned a malformed ${fieldLabel}: ${value}`);
  }
  const isLoopback = LOOPBACK_HOSTNAMES.has(parsed.hostname);
  const allowed = isLoopback ? [secureProtocol, insecureProtocol] : [secureProtocol];
  if (!allowed.includes(parsed.protocol as 'https:' | 'wss:' | 'http:' | 'ws:')) {
    throw new EcoReliefConfigError(
      `${fieldLabel} must use ${allowed.join(' or ')} — got ${parsed.protocol} (${value})`,
    );
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
  assertUrlWithProtocol(config.indexerUri, 'https:', 'http:', 'indexer URL');
  assertUrlWithProtocol(config.indexerWsUri, 'wss:', 'ws:', 'indexer websocket URL');
  assertUrlWithProtocol(config.proverServerUri, 'https:', 'http:', 'proof server URL');
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
