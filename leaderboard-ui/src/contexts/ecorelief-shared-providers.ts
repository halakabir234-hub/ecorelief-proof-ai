/**
 * Role-agnostic provider construction shared by both EcoRelief connection
 * managers. Deliberately takes no secret and returns no private-state
 * provider — a secret can only ever enter the picture inside
 * BrowserEcoReliefApplicantManager / BrowserEcoReliefVerifierManager, each of
 * which adds its own role-typed `privateStateProvider` on top of what this
 * function returns.
 */

import { type Logger } from 'pino';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { fromHex, toHex } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Binding,
  type FinalizedTransaction,
  Proof,
  SignatureEnabled,
  Transaction,
  type TransactionId,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { type EcoReliefCircuitKeys } from '@midnight-ntwrk/leaderboard-api/ecorelief';
import { connectToWallet } from '../lib/wallet-connect';
import { connectLocalWallet, type WsConnectedWallet } from '../lib/ws-wallet-connector';
import { assertValidNetworkId, assertValidWalletConfig } from '../lib/runtime-config';

const DEFAULT_LOCAL_WALLET_WS_URL = 'ws://localhost:9932';

export interface EcoReliefBaseProviders {
  readonly zkConfigProvider: FetchZkConfigProvider<EcoReliefCircuitKeys>;
  readonly proofProvider: ReturnType<typeof httpClientProofProvider>;
  readonly publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  readonly walletProvider: {
    getCoinPublicKey(): string;
    getEncryptionPublicKey(): string;
    balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction>;
  };
  readonly midnightProvider: {
    submitTx(tx: FinalizedTransaction): Promise<TransactionId>;
  };
}

/**
 * EcoRelief's compiled circuit assets are served under a namespaced
 * `/ecorelief` subpath (see leaderboard-ui/package.json's dev/build scripts)
 * so they can never collide with leaderboard's own flat `/keys`/`/zkir`.
 */
export function ecoReliefZkConfigBaseUrl(): string {
  return `${window.location.origin}/ecorelief`;
}

export async function createEcoReliefBaseProviders(logger: Logger): Promise<EcoReliefBaseProviders> {
  // EcoRelief-specific override so it can target the local "undeployed"
  // network independently of the leaderboard demo's own VITE_NETWORK_ID.
  const rawNetworkId = import.meta.env.VITE_ECORELIEF_NETWORK_ID ?? import.meta.env.VITE_NETWORK_ID;
  assertValidNetworkId(rawNetworkId);
  setNetworkId(rawNetworkId);

  // Local dev only: the "undeployed" network has no Lace support, so connect
  // to a real local wallet connector (`midnight serve`) over WebSocket
  // JSON-RPC instead of scanning window.midnight. Preprod/production always
  // goes through the unchanged Lace browser-extension path below.
  const connectedAPI: WsConnectedWallet =
    rawNetworkId === 'undeployed'
      ? await connectLocalWallet(
          import.meta.env.VITE_ECORELIEF_LOCAL_WALLET_WS_URL ?? DEFAULT_LOCAL_WALLET_WS_URL,
          rawNetworkId,
        )
      : await connectToWallet(logger, rawNetworkId);
  const config = await connectedAPI.getConfiguration();
  assertValidWalletConfig(config);
  const shieldedAddresses = await connectedAPI.getShieldedAddresses();

  const zkConfigProvider = new FetchZkConfigProvider<EcoReliefCircuitKeys>(ecoReliefZkConfigBaseUrl(), fetch.bind(window));

  return {
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proverServerUri, zkConfigProvider),
    publicDataProvider: indexerPublicDataProvider(config.indexerUri, config.indexerWsUri),
    walletProvider: {
      getCoinPublicKey: () => shieldedAddresses.shieldedCoinPublicKey,
      getEncryptionPublicKey: () => shieldedAddresses.shieldedEncryptionPublicKey,
      balanceTx: async (tx: UnboundTransaction): Promise<FinalizedTransaction> => {
        const received = await connectedAPI.balanceUnsealedTransaction(toHex(tx.serialize()));
        return Transaction.deserialize<SignatureEnabled, Proof, Binding>('signature', 'proof', 'binding', fromHex(received.tx));
      },
    },
    midnightProvider: {
      submitTx: async (tx: FinalizedTransaction): Promise<TransactionId> => {
        await connectedAPI.submitTransaction(toHex(tx.serialize()));
        return tx.identifiers()[0];
      },
    },
  };
}
