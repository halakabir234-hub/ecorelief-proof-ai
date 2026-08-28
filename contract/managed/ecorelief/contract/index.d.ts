import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  getApplicantSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getVerifierSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              claimCommitment_0: Uint8Array,
              eventCodeHash_0: Uint8Array,
              modelVersionHash_0: Uint8Array,
              priorityBand_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  moveToReview(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approveClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rejectClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markProcessed(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  verifyClaimOwnership(context: __compactRuntime.CircuitContext<PS>,
                       claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              claimCommitment_0: Uint8Array,
              eventCodeHash_0: Uint8Array,
              modelVersionHash_0: Uint8Array,
              priorityBand_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  moveToReview(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approveClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rejectClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markProcessed(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  verifyClaimOwnership(context: __compactRuntime.CircuitContext<PS>,
                       claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  applicantNullifier(secret_0: Uint8Array, eventCodeHash_0: Uint8Array): Uint8Array;
  verifierCommitment(secret_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  applicantNullifier(context: __compactRuntime.CircuitContext<PS>,
                     secret_0: Uint8Array,
                     eventCodeHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  verifierCommitment(context: __compactRuntime.CircuitContext<PS>,
                     secret_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  submitClaim(context: __compactRuntime.CircuitContext<PS>,
              claimCommitment_0: Uint8Array,
              eventCodeHash_0: Uint8Array,
              modelVersionHash_0: Uint8Array,
              priorityBand_0: bigint): __compactRuntime.CircuitResults<PS, bigint>;
  moveToReview(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  approveClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  rejectClaim(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  markProcessed(context: __compactRuntime.CircuitContext<PS>, claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  verifyClaimOwnership(context: __compactRuntime.CircuitContext<PS>,
                       claimId_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  claims: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): { status: bigint,
                             claimCommitment: Uint8Array,
                             eventCodeHash: Uint8Array,
                             modelVersionHash: Uint8Array,
                             priorityBand: bigint
                           };
    [Symbol.iterator](): Iterator<[bigint, { status: bigint,
  claimCommitment: Uint8Array,
  eventCodeHash: Uint8Array,
  modelVersionHash: Uint8Array,
  priorityBand: bigint
}]>
  };
  usedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<[Uint8Array, boolean]>
  };
  readonly claimCount: bigint;
  readonly verifierAuthority: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               verifierHash_0: Uint8Array): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
