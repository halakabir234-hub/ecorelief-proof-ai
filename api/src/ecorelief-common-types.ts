/**
 * EcoRelief common types and abstractions.
 * @module
 */

import { type MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { type FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  type EcoRelief,
  type EcoReliefApplicantPrivateState,
  type EcoReliefVerifierPrivateState,
} from 'leaderboard-contract/ecorelief';

export const ecoReliefApplicantPrivateStateKey = 'ecoReliefApplicantPrivateState';
export const ecoReliefVerifierPrivateStateKey = 'ecoReliefVerifierPrivateState';
export type EcoReliefApplicantPrivateStateId = typeof ecoReliefApplicantPrivateStateKey;
export type EcoReliefVerifierPrivateStateId = typeof ecoReliefVerifierPrivateStateKey;

export type EcoReliefCircuitKeys =
  | 'submitClaim'
  | 'moveToReview'
  | 'approveClaim'
  | 'rejectClaim'
  | 'markProcessed'
  | 'verifyClaimOwnership';

export type EcoReliefApplicantContractType = EcoRelief.Contract<EcoReliefApplicantPrivateState>;
export type EcoReliefVerifierContractType = EcoRelief.Contract<EcoReliefVerifierPrivateState>;

export type EcoReliefApplicantProviders = MidnightProviders<
  EcoReliefCircuitKeys,
  EcoReliefApplicantPrivateStateId,
  EcoReliefApplicantPrivateState
>;
export type EcoReliefVerifierProviders = MidnightProviders<
  EcoReliefCircuitKeys,
  EcoReliefVerifierPrivateStateId,
  EcoReliefVerifierPrivateState
>;

export type DeployedEcoReliefApplicantContract = FoundContract<EcoReliefApplicantContractType>;
export type DeployedEcoReliefVerifierContract = FoundContract<EcoReliefVerifierContractType>;

export const CLAIM_STATUS_LABELS = ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Processed'] as const;

export interface ClaimSummary {
  readonly claimId: string;
  readonly status: number;
  readonly statusLabel: string;
  readonly claimCommitment: string;
  readonly eventCodeHash: string;
  readonly modelVersionHash: string;
  readonly priorityBand: number;
}

export interface EcoReliefDerivedState {
  readonly claimCount: number;
  readonly claims: ClaimSummary[];
  readonly verifierAuthority: string;
}
