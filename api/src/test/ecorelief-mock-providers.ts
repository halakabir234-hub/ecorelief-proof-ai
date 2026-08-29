/**
 * A reusable fake `MidnightProviders` bundle for EcoRelief, following the
 * same "minimal stand-in satisfying only what's actually exercised" style as
 * the fake ledger helpers in ecorelief.test.ts.
 *
 * Every provider method that would require a live wallet, indexer, or proof
 * server throws a clear "not implemented in offline mock" error if actually
 * invoked. This is deliberate: a test that accidentally reaches real ZK
 * proving or network I/O through this mock must fail loudly and immediately,
 * not hang or silently produce a meaningless result. Tests built on this
 * mock should only exercise code paths that are guaranteed (by reading the
 * source) to run before any provider method is actually called — e.g.
 * private-state validation, which `EcoReliefApplicantAPI.join` /
 * `EcoReliefVerifierAPI.deploy` perform synchronously, before ever invoking
 * `findDeployedContract`/`deployContract`.
 *
 * Fully, honestly typed against the real provider interfaces from
 * `@midnight-ntwrk/midnight-js-types` — no `any`/`as any`.
 */

import type { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { Observable } from 'rxjs';
import {
  type PublicDataProvider,
  type ProofProvider,
  type WalletProvider,
  type MidnightProvider,
  ZKConfigProvider,
  type UnshieldedBalances,
  type PrivateStateProvider,
} from '@midnight-ntwrk/midnight-js-types';
import type { EcoReliefApplicantProviders, EcoReliefVerifierProviders } from '../ecorelief-common-types.js';

function notImplemented(name: string): () => never {
  return () => {
    throw new Error(`${name} is not implemented in the offline mock provider bundle.`);
  };
}

function makeMockPrivateStateProvider<PSI extends string, PS>(): PrivateStateProvider<PSI, PS> {
  const states = new Map<PSI, PS>();
  return {
    setContractAddress: () => {},
    set: (id: PSI, state: PS) => {
      states.set(id, state);
      return Promise.resolve();
    },
    get: (id: PSI) => Promise.resolve(states.get(id) ?? null),
    remove: (id: PSI) => {
      states.delete(id);
      return Promise.resolve();
    },
    clear: () => {
      states.clear();
      return Promise.resolve();
    },
    setSigningKey: notImplemented('privateStateProvider.setSigningKey'),
    getSigningKey: notImplemented('privateStateProvider.getSigningKey'),
    removeSigningKey: notImplemented('privateStateProvider.removeSigningKey'),
    clearSigningKeys: notImplemented('privateStateProvider.clearSigningKeys'),
    exportPrivateStates: notImplemented('privateStateProvider.exportPrivateStates'),
    importPrivateStates: notImplemented('privateStateProvider.importPrivateStates'),
    exportSigningKeys: notImplemented('privateStateProvider.exportSigningKeys'),
    importSigningKeys: notImplemented('privateStateProvider.importSigningKeys'),
  };
}

function makeMockPublicDataProvider(): PublicDataProvider {
  return {
    queryContractState: notImplemented('publicDataProvider.queryContractState'),
    queryZSwapAndContractState: notImplemented('publicDataProvider.queryZSwapAndContractState'),
    queryDeployContractState: notImplemented('publicDataProvider.queryDeployContractState'),
    queryUnshieldedBalances: notImplemented('publicDataProvider.queryUnshieldedBalances'),
    watchForContractState: notImplemented('publicDataProvider.watchForContractState'),
    watchForUnshieldedBalances: notImplemented('publicDataProvider.watchForUnshieldedBalances'),
    watchForDeployTxData: notImplemented('publicDataProvider.watchForDeployTxData'),
    watchForTxData: notImplemented('publicDataProvider.watchForTxData'),
    contractStateObservable: () => new Observable<ContractState>((subscriber) => {
      subscriber.error(new Error('publicDataProvider.contractStateObservable is not implemented in the offline mock provider bundle.'));
    }),
    unshieldedBalancesObservable: () => new Observable<UnshieldedBalances>((subscriber) => {
      subscriber.error(new Error('publicDataProvider.unshieldedBalancesObservable is not implemented in the offline mock provider bundle.'));
    }),
  };
}

function makeMockProofProvider(): ProofProvider {
  return { proveTx: notImplemented('proofProvider.proveTx') };
}

function makeMockWalletProvider(): WalletProvider {
  return {
    getCoinPublicKey: notImplemented('walletProvider.getCoinPublicKey'),
    getEncryptionPublicKey: notImplemented('walletProvider.getEncryptionPublicKey'),
    balanceTx: notImplemented('walletProvider.balanceTx'),
  };
}

function makeMockMidnightProvider(): MidnightProvider {
  return { submitTx: notImplemented('midnightProvider.submitTx') };
}

function makeMockZkConfigProvider<K extends string>(): ZKConfigProvider<K> {
  class MockZkConfigProvider extends ZKConfigProvider<K> {
    getZKIR = notImplemented('zkConfigProvider.getZKIR');
    getProverKey = notImplemented('zkConfigProvider.getProverKey');
    getVerifierKey = notImplemented('zkConfigProvider.getVerifierKey');
  }
  return new MockZkConfigProvider();
}

export function makeMockApplicantProviders(): EcoReliefApplicantProviders {
  return {
    privateStateProvider: makeMockPrivateStateProvider(),
    publicDataProvider: makeMockPublicDataProvider(),
    proofProvider: makeMockProofProvider(),
    walletProvider: makeMockWalletProvider(),
    midnightProvider: makeMockMidnightProvider(),
    zkConfigProvider: makeMockZkConfigProvider(),
  };
}

export function makeMockVerifierProviders(): EcoReliefVerifierProviders {
  return {
    privateStateProvider: makeMockPrivateStateProvider(),
    publicDataProvider: makeMockPublicDataProvider(),
    proofProvider: makeMockProofProvider(),
    walletProvider: makeMockWalletProvider(),
    midnightProvider: makeMockMidnightProvider(),
    zkConfigProvider: makeMockZkConfigProvider(),
  };
}
