/**
 * Browser connection manager for the EcoRelief VERIFIER role only.
 *
 * Mirror image of BrowserEcoReliefApplicantManager — see that file's header
 * comment for the role-separation rationale. This class has no import,
 * field, or method that can ever produce or accept an applicant secret.
 */

import { type Logger } from 'pino';
import { BehaviorSubject, type Observable } from 'rxjs';
import {
  EcoReliefVerifierAPI,
  type EcoReliefVerifierProviders,
} from '@midnight-ntwrk/leaderboard-api/ecorelief';
import { type EcoReliefVerifierPrivateState } from 'leaderboard-contract/ecorelief';
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

const VERIFIER_VAULT_STORAGE_KEY = 'midnight-ecorelief-verifier-vault-v1';
const VERIFIER_ROLE = 'ecorelief-verifier' as const;

export type EcoReliefSecretStatus = 'no-vault' | 'locked' | 'unlocked';

export type EcoReliefVerifierConnection =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected'; readonly api: EcoReliefVerifierAPI }
  | { readonly status: 'failed'; readonly error: Error };

export class BrowserEcoReliefVerifierManager {
  #initializedBase: ReturnType<typeof createEcoReliefBaseProviders> | undefined;
  #secret: Uint8Array | undefined;
  readonly #connectionSubject = new BehaviorSubject<EcoReliefVerifierConnection>({ status: 'idle' });
  readonly connection$: Observable<EcoReliefVerifierConnection> = this.#connectionSubject;

  constructor(private readonly logger: Logger) {
    if (!hasVault(VERIFIER_VAULT_STORAGE_KEY)) {
      this.#secret = generateSessionSecret();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.lock());
    }
  }

  secretStatus(): EcoReliefSecretStatus {
    if (this.#secret) return 'unlocked';
    return hasVault(VERIFIER_VAULT_STORAGE_KEY) ? 'locked' : 'no-vault';
  }

  /** Short non-secret display fingerprint of the active identity, or undefined if none is unlocked. */
  fingerprint(): Promise<string> | undefined {
    return this.#secret ? fingerprintSecret(this.#secret) : undefined;
  }

  async unlock(passphrase: string): Promise<void> {
    const envelope = loadVaultEnvelope(VERIFIER_VAULT_STORAGE_KEY);
    if (!envelope) {
      throw new Error('No saved verifier vault to unlock.');
    }
    const secret = await decryptVaultToSecret(envelope, passphrase, VERIFIER_ROLE);
    this.#secret = secret;
  }

  async saveVault(passphrase: string): Promise<void> {
    if (!this.#secret) {
      throw new Error('No active verifier identity to save. Generate or unlock one first.');
    }
    const envelope = await encryptSecretToVault(this.#secret, passphrase, VERIFIER_ROLE);
    saveVaultEnvelope(VERIFIER_VAULT_STORAGE_KEY, envelope);
  }

  lock(): void {
    if (this.#secret) {
      zeroize(this.#secret);
    }
    this.#secret = undefined;
  }

  /** Discards the current secret and any saved vault, then generates a brand-new session secret. WARNING: for an already-deployed contract, this abandons the on-chain verifierAuthority tied to the previous secret — the new identity will not be authorized on that contract. */
  generateNewIdentity(): void {
    this.lock();
    clearVault(VERIFIER_VAULT_STORAGE_KEY);
    this.#secret = generateSessionSecret();
  }

  private getBaseProviders(): ReturnType<typeof createEcoReliefBaseProviders> {
    return (this.#initializedBase ??= createEcoReliefBaseProviders(this.logger));
  }

  deploy(): void {
    if (!this.#secret) {
      this.#connectionSubject.next({
        status: 'failed',
        error: new Error('Unlock or generate a verifier identity before deploying.'),
      });
      return;
    }
    const secret = this.#secret.slice();
    this.#connectionSubject.next({ status: 'connecting' });
    void (async () => {
      try {
        const base = await this.getBaseProviders();
        const providers: EcoReliefVerifierProviders = {
          ...base,
          privateStateProvider: inMemoryPrivateStateProvider<string, EcoReliefVerifierPrivateState>(),
        };
        const api = await EcoReliefVerifierAPI.deploy(providers, secret, this.logger);
        this.#connectionSubject.next({ status: 'connected', api });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.#connectionSubject.next({ status: 'failed', error: err });
      }
    })();
  }

  join(contractAddress: string): void {
    assertValidContractAddress(contractAddress);
    if (!this.#secret) {
      this.#connectionSubject.next({
        status: 'failed',
        error: new Error('Unlock or generate a verifier identity before joining.'),
      });
      return;
    }
    const secret = this.#secret.slice();
    this.#connectionSubject.next({ status: 'connecting' });
    void (async () => {
      try {
        const base = await this.getBaseProviders();
        const providers: EcoReliefVerifierProviders = {
          ...base,
          privateStateProvider: inMemoryPrivateStateProvider<string, EcoReliefVerifierPrivateState>(),
        };
        const api = await EcoReliefVerifierAPI.join(providers, contractAddress, secret, this.logger);
        this.#connectionSubject.next({ status: 'connected', api });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.#connectionSubject.next({ status: 'failed', error: err });
      }
    })();
  }
}
