/**
 * Shared business logic for the EcoRelief contract.
 *
 * Platform-agnostic — works from browser (Lace) or CLI (wallet-sdk).
 * Each platform provides its own provider implementations.
 *
 * Role separation is enforced at the type level: EcoReliefApplicantAPI only
 * ever carries an applicant secret and only exposes applicant-safe circuit
 * calls; EcoReliefVerifierAPI only ever carries a verifier secret and only
 * exposes verifier-only circuit calls. Neither class can construct the
 * other role's private state.
 *
 * @packageDocumentation
 */

import { type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { type Logger } from 'pino';
import {
  type EcoReliefDerivedState,
  type ClaimSummary,
  type EcoReliefApplicantProviders,
  type EcoReliefVerifierProviders,
  type DeployedEcoReliefApplicantContract,
  type DeployedEcoReliefVerifierContract,
  ecoReliefApplicantPrivateStateKey,
  ecoReliefVerifierPrivateStateKey,
  CLAIM_STATUS_LABELS,
} from './ecorelief-common-types.js';
import {
  EcoRelief,
  CompiledEcoReliefApplicantContract,
  CompiledEcoReliefVerifierContract,
  createEcoReliefApplicantPrivateState,
  createEcoReliefVerifierPrivateState,
} from 'leaderboard-contract/ecorelief';
import * as utils from './utils/ecorelief.js';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { map, type Observable } from 'rxjs';

/** Derives the UI-facing state from the raw generated ledger type. Shared by both roles — reading public ledger state carries no privacy asymmetry, only writes do. */
export function mapLedgerToDerivedState(ledgerState: EcoRelief.Ledger): EcoReliefDerivedState {
  const claims: ClaimSummary[] = [];
  for (const [key, entry] of ledgerState.claims) {
    const status = Number(entry.status);
    claims.push({
      claimId: key.toString(),
      status,
      statusLabel: CLAIM_STATUS_LABELS[status] ?? 'Unknown',
      claimCommitment: utils.bytesToHex(entry.claimCommitment),
      eventCodeHash: utils.bytesToHex(entry.eventCodeHash),
      modelVersionHash: utils.bytesToHex(entry.modelVersionHash),
      priorityBand: Number(entry.priorityBand),
    });
  }
  return {
    claimCount: Number(ledgerState.claimCount),
    claims,
    verifierAuthority: utils.bytesToHex(ledgerState.verifierAuthority),
  };
}

/**
 * API for an applicant-role session against a deployed EcoRelief contract.
 *
 * Created via `EcoReliefApplicantAPI.join()`. Never carries a verifier secret.
 */
export class EcoReliefApplicantAPI {
  private constructor(
    public readonly deployedContract: DeployedEcoReliefApplicantContract,
    providers: EcoReliefApplicantProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => EcoRelief.ledger(contractState.data)),
        map(mapLedgerToDerivedState),
      );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<EcoReliefDerivedState>;

  /** Submit a claim. Returns the new claim ID, taken directly from the circuit's own typed return value. */
  async submitClaim(
    claimCommitment: Uint8Array,
    eventCodeHash: Uint8Array,
    modelVersionHash: Uint8Array,
    priorityBand: number,
  ): Promise<bigint> {
    const result = await this.deployedContract.callTx.submitClaim(
      claimCommitment,
      eventCodeHash,
      modelVersionHash,
      BigInt(priorityBand),
    );
    return result.private.result;
  }

  /** Prove ownership of a claim without changing its state. */
  async verifyClaimOwnership(claimId: bigint): Promise<void> {
    await this.deployedContract.callTx.verifyClaimOwnership(claimId);
  }

  /** Join an existing EcoRelief contract as an applicant. */
  static async join(
    providers: EcoReliefApplicantProviders,
    contractAddress: ContractAddress,
    applicantSecret: Uint8Array,
    logger?: Logger,
  ): Promise<EcoReliefApplicantAPI> {
    const deployedContract = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: CompiledEcoReliefApplicantContract,
      privateStateId: ecoReliefApplicantPrivateStateKey,
      initialPrivateState: createEcoReliefApplicantPrivateState(applicantSecret),
    });
    return new EcoReliefApplicantAPI(deployedContract, providers, logger);
  }
}

/**
 * API for a verifier-role session against a deployed EcoRelief contract.
 *
 * Created via `EcoReliefVerifierAPI.deploy()` (the deployer becomes the
 * authorized verifier atomically) or `EcoReliefVerifierAPI.join()`. Never
 * carries an applicant secret.
 */
export class EcoReliefVerifierAPI {
  private constructor(
    public readonly deployedContract: DeployedEcoReliefVerifierContract,
    providers: EcoReliefVerifierProviders,
    private readonly logger?: Logger,
  ) {
    this.deployedContractAddress = deployedContract.deployTxData.public.contractAddress;
    providers.privateStateProvider.setContractAddress(this.deployedContractAddress);

    this.state$ = providers.publicDataProvider
      .contractStateObservable(this.deployedContractAddress, { type: 'latest' })
      .pipe(
        map((contractState) => EcoRelief.ledger(contractState.data)),
        map(mapLedgerToDerivedState),
      );
  }

  readonly deployedContractAddress: ContractAddress;
  readonly state$: Observable<EcoReliefDerivedState>;

  async moveToReview(claimId: bigint): Promise<void> {
    await this.deployedContract.callTx.moveToReview(claimId);
  }

  async approveClaim(claimId: bigint): Promise<void> {
    await this.deployedContract.callTx.approveClaim(claimId);
  }

  async rejectClaim(claimId: bigint): Promise<void> {
    await this.deployedContract.callTx.rejectClaim(claimId);
  }

  async markProcessed(claimId: bigint): Promise<void> {
    await this.deployedContract.callTx.markProcessed(claimId);
  }

  /** Deploy a new EcoRelief contract. The deployer becomes the authorized verifier atomically via the constructor. */
  static async deploy(
    providers: EcoReliefVerifierProviders,
    verifierSecret: Uint8Array,
    logger?: Logger,
  ): Promise<EcoReliefVerifierAPI> {
    const verifierHash = EcoRelief.pureCircuits.verifierCommitment(verifierSecret);
    const deployedContract = await deployContract(providers, {
      compiledContract: CompiledEcoReliefVerifierContract,
      privateStateId: ecoReliefVerifierPrivateStateKey,
      initialPrivateState: createEcoReliefVerifierPrivateState(verifierSecret),
      args: [verifierHash],
    });
    return new EcoReliefVerifierAPI(deployedContract, providers, logger);
  }

  /** Join an existing EcoRelief contract as its authorized verifier. */
  static async join(
    providers: EcoReliefVerifierProviders,
    contractAddress: ContractAddress,
    verifierSecret: Uint8Array,
    logger?: Logger,
  ): Promise<EcoReliefVerifierAPI> {
    const deployedContract = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: CompiledEcoReliefVerifierContract,
      privateStateId: ecoReliefVerifierPrivateStateKey,
      initialPrivateState: createEcoReliefVerifierPrivateState(verifierSecret),
    });
    return new EcoReliefVerifierAPI(deployedContract, providers, logger);
  }
}

export * as utils from './utils/ecorelief.js';
export * from './ecorelief-common-types.js';
