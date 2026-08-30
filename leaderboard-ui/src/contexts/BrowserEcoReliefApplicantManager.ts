/**
 * Browser connection manager for the EcoRelief APPLICANT role only.
 *
 * This class has no import, field, or method that can ever produce or accept
 * a verifier secret — role separation is enforced by having two entirely
 * separate manager classes (this one and BrowserEcoReliefVerifierManager),
 * not by a runtime role flag on a shared class. See
 * BrowserEcoReliefVerifierManager.ts for the mirror-image implementation.
 *
 * Secret lifecycle: a secret lives only in memory (`#secret`) unless the user
 * explicitly calls `saveVault()`. On construction, if no vault has ever been
 * saved, a fresh session-only secret is generated immediately; if a vault
 * exists, the manager starts `locked` and the secret stays `undefined` until
 * `unlock()` succeeds.
 */

import { type Logger } from 'pino';
import { BehaviorSubject, type Observable } from 'rxjs';
import {
  EcoReliefApplicantAPI,
  type EcoReliefApplicantProviders,
} from '@midnight-ntwrk/leaderboard-api/ecorelief';
import { type EcoReliefApplicantPrivateState } from 'leaderboard-contract/ecorelief';
import { createEcoReliefBaseProviders } from './ecorelief-shared-providers';
import { inMemoryPrivateStateProvider } from '../in-memory-private-state-provider';
import {
  generateSessionSecret,
  encryptSecretToVault,
  decryptVaultToSecret,
  loadVaultEnvelope,
  saveVaultEnvelope,
  clearVault,
  hasVault,
  zeroize,
  fingerprintSecret,
} from '../lib/secret-vault';
import { assertValidContractAddress } from '../lib/runtime-config';

const APPLICANT_VAULT_STORAGE_KEY = 'midnight-ecorelief-applicant-vault-v1';
const APPLICANT_ROLE = 'ecorelief-applicant' as const;

export type EcoReliefSecretStatus = 'no-vault' | 'locked' | 'unlocked';

export type EcoReliefApplicantConnection =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected'; readonly api: EcoReliefApplicantAPI }
  | { readonly status: 'failed'; readonly error: Error };

export class BrowserEcoReliefApplicantManager {
  #initializedBase: ReturnType<typeof createEcoReliefBaseProviders> | undefined;
  #secret: Uint8Array | undefined;
  readonly #connectionSubject = new BehaviorSubject<EcoReliefApplicantConnection>({ status: 'idle' });
  readonly connection$: Observable<EcoReliefApplicantConnection> = this.#connectionSubject;

  constructor(private readonly logger: Logger) {
    if (!hasVault(APPLICANT_VAULT_STORAGE_KEY)) {
      this.#secret = generateSessionSecret();
    }
    if (typeof window !== 'undefined') {
      // Best-effort only: JavaScript cannot guarantee memory is scrubbed
      // before page teardown. This reduces the window a stale secret sits in
      // memory; it is not a security guarantee.
      window.addEventListener('beforeunload', () => this.lock());
    }
  }

  secretStatus(): EcoReliefSecretStatus {
    if (this.#secret) return 'unlocked';
    return hasVault(APPLICANT_VAULT_STORAGE_KEY) ? 'locked' : 'no-vault';
  }

  /** Short non-secret display fingerprint of the active identity, or undefined if none is unlocked. */
  fingerprint(): Promise<string> | undefined {
    return this.#secret ? fingerprintSecret(this.#secret) : undefined;
  }

  async unlock(passphrase: string): Promise<void> {
    const envelope = loadVaultEnvelope(APPLICANT_VAULT_STORAGE_KEY);
    if (!envelope) {
      throw new Error('No saved applicant vault to unlock.');
    }
    const secret = await decryptVaultToSecret(envelope, passphrase, APPLICANT_ROLE);
    this.#secret = secret;
  }

  async saveVault(passphrase: string): Promise<void> {
    if (!this.#secret) {
      throw new Error('No active applicant identity to save. Generate or unlock one first.');
    }
    const envelope = await encryptSecretToVault(this.#secret, passphrase, APPLICANT_ROLE);
    saveVaultEnvelope(APPLICANT_VAULT_STORAGE_KEY, envelope);
  }

  /** Zeroizes and drops the in-memory secret. Does not delete a saved vault. */
  lock(): void {
    if (this.#secret) {
      zeroize(this.#secret);
    }
    this.#secret = undefined;
  }

  /** Discards the current secret and any saved vault, then generates a brand-new session secret. This abandons any on-chain identity tied to the previous secret. */
  generateNewIdentity(): void {
    this.lock();
    clearVault(APPLICANT_VAULT_STORAGE_KEY);
    this.#secret = generateSessionSecret();
  }

  private getBaseProviders(): ReturnType<typeof createEcoReliefBaseProviders> {
    return (this.#initializedBase ??= createEcoReliefBaseProviders(this.logger));
  }

  join(contractAddress: string): void {
    assertValidContractAddress(contractAddress);
    if (!this.#secret) {
      this.#connectionSubject.next({
        status: 'failed',
        error: new Error('Unlock or generate an applicant identity before joining.'),
      });
      return;
    }
    const secret = this.#secret.slice();
    this.#connectionSubject.next({ status: 'connecting' });
    void (async () => {
      try {
        const base = await this.getBaseProviders();
        const providers: EcoReliefApplicantProviders = {
          ...base,
          privateStateProvider: inMemoryPrivateStateProvider<string, EcoReliefApplicantPrivateState>(),
        };
        const api = await EcoReliefApplicantAPI.join(providers, contractAddress, secret, this.logger);
        this.#connectionSubject.next({ status: 'connected', api });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.#connectionSubject.next({ status: 'failed', error: err });
      }
    })();
  }
}
