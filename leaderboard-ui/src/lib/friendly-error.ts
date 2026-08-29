/**
 * Shared error classification for user-facing messages. Extracted from
 * `App.tsx`'s original `friendlyError`/`extractErrorMessage`, kept
 * behavior-identical for leaderboard's own rules (passed in via `extraRules`
 * at its call site) and extended with rule sets for EcoRelief.
 */

export interface ErrorRule {
  readonly test: (message: string) => boolean;
  readonly message: string;
}

function getProp(value: unknown, key: string): unknown {
  if (typeof value === 'object' && value !== null && key in value) {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

/**
 * Unwraps nested Effect-TS `FiberFailure` errors (`e.cause.failure.message`,
 * `e.cause.failure.cause.message`, `e.cause.message`) the way the original
 * implementation did, fully typed through `unknown` with no `any`/`as any`.
 */
export function extractErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message !== '') return e.message;

  const cause = getProp(e, 'cause');
  const failure = getProp(cause, 'failure');
  const failureMessage = getProp(failure, 'message');
  if (typeof failureMessage === 'string' && failureMessage !== '') return failureMessage;

  const nestedFailureCause = getProp(failure, 'cause');
  const nestedMessage = getProp(nestedFailureCause, 'message');
  if (typeof nestedMessage === 'string' && nestedMessage !== '') return nestedMessage;

  const causeMessage = getProp(cause, 'message');
  if (typeof causeMessage === 'string' && causeMessage !== '') return causeMessage;

  if (typeof e === 'string') return e;

  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

export const BASE_ERROR_RULES: ErrorRule[] = [
  { test: (m) => m.includes('User rejected'), message: 'Transaction cancelled.' },
  {
    test: (m) => m.includes('Failed to fetch') || m.includes('Failed Proof Server'),
    message: 'Could not reach the proof server. Check your connection and try again.',
  },
  { test: (m) => m.includes('mismatched verifier keys'), message: 'Contract version mismatch. Try deploying a new contract.' },
  { test: (m) => m.includes('not authorized'), message: 'Wallet connection was rejected. Try connecting again.' },
  { test: (m) => m.includes('insufficient') || m.includes('DUST'), message: 'Insufficient funds. Request tokens from the Preprod faucet.' },
  { test: (m) => m.includes('Network ID'), message: 'Network configuration error. Make sure Lace is set to Preprod.' },
  { test: (m) => m.includes('submission') || m.includes('Submission'), message: 'Transaction failed to submit. Please try again.' },
];

export function friendlyError(e: unknown, extraRules: ErrorRule[] = []): string {
  const msg = extractErrorMessage(e);
  const rule = [...extraRules, ...BASE_ERROR_RULES].find((r) => r.test(msg));
  return rule?.message ?? msg ?? 'An unexpected error occurred. Check the browser console for details.';
}
