/**
 * Shared Midnight Lace wallet detection/connection logic.
 *
 * Extracted so leaderboard and EcoRelief (applicant + verifier) do not each
 * maintain their own copy of the same poll/timeout/connect state machine.
 * Behavior is unchanged from the pre-extraction implementations in
 * `BrowserLeaderboardManager.ts` and `App.tsx`.
 */

import { type ConnectedAPI, type InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import { type Logger } from 'pino';
import { catchError, concatMap, filter, firstValueFrom, interval, map, take, throwError, timeout } from 'rxjs';
import { pipe as fnPipe } from 'fp-ts/function';
import semver from 'semver';

export const COMPATIBLE_CONNECTOR_API_VERSION = '4.x';

/** Lax predicate used only for UI wallet-presence display (no version check). */
export function getAnyWallet(): InitialAPI | undefined {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI => !!wallet && typeof wallet === 'object' && 'apiVersion' in wallet,
  );
}

/** Strict predicate used before any real connect/transaction flow. */
export function getFirstCompatibleWallet(): InitialAPI | undefined {
  if (!window.midnight) return undefined;
  return Object.values(window.midnight).find(
    (wallet): wallet is InitialAPI =>
      !!wallet &&
      typeof wallet === 'object' &&
      'apiVersion' in wallet &&
      semver.satisfies(wallet.apiVersion, COMPATIBLE_CONNECTOR_API_VERSION),
  );
}

export function connectToWallet(logger: Logger, networkId: string): Promise<ConnectedAPI> {
  return firstValueFrom(
    fnPipe(
      interval(100),
      map(() => getFirstCompatibleWallet()),
      filter((api): api is InitialAPI => !!api),
      take(1),
      timeout({ first: 3_000, with: () => throwError(() => new Error('Could not find Midnight Lace wallet.')) }),
      concatMap(async (initialAPI) => initialAPI.connect(networkId)),
      timeout({ first: 5_000, with: () => throwError(() => new Error('Lace wallet failed to respond.')) }),
      catchError((error) => throwError(() => (error instanceof Error ? error : new Error('Wallet not authorized')))),
    ),
  );
}

/**
 * Polls for a wallet using the lax predicate for up to `timeoutMs`, calling
 * back on each state change. Mirrors `App.tsx`'s original inline polling
 * effect so it can be reused without behavior change.
 */
export function pollForAnyWallet(
  onFound: (wallet: InitialAPI) => void,
  onTimeout: () => void,
  timeoutMs = 5_000,
  intervalMs = 100,
): () => void {
  const found = getAnyWallet();
  if (found) {
    onFound(found);
    return () => {};
  }
  let elapsed = 0;
  const t = setInterval(() => {
    elapsed += intervalMs;
    const w = getAnyWallet();
    if (w) {
      onFound(w);
      clearInterval(t);
    } else if (elapsed >= timeoutMs) {
      onTimeout();
      clearInterval(t);
    }
  }, intervalMs);
  return () => clearInterval(t);
}
