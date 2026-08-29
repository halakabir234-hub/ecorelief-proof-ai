import { CompiledContract } from '@midnight-ntwrk/compact-js';

export * as EcoRelief from '../managed/ecorelief/contract/index.js';
export {
  createApplicantWitnesses,
  createVerifierWitnesses,
  createEcoReliefApplicantPrivateState,
  createEcoReliefVerifierPrivateState,
} from './ecorelief-witnesses.js';
export type { EcoReliefApplicantPrivateState, EcoReliefVerifierPrivateState } from './ecorelief-witnesses.js';

import * as EcoReliefContract from '../managed/ecorelief/contract/index.js';
import { createApplicantWitnesses, createVerifierWitnesses } from './ecorelief-witnesses.js';
import type { EcoReliefApplicantPrivateState, EcoReliefVerifierPrivateState } from './ecorelief-witnesses.js';

export const CompiledEcoReliefApplicantContract = CompiledContract.make<
  EcoReliefContract.Contract<EcoReliefApplicantPrivateState>
>('ecorelief', EcoReliefContract.Contract).pipe(
  CompiledContract.withWitnesses(createApplicantWitnesses()),
  CompiledContract.withCompiledFileAssets('./managed/ecorelief'),
);

export const CompiledEcoReliefVerifierContract = CompiledContract.make<
  EcoReliefContract.Contract<EcoReliefVerifierPrivateState>
>('ecorelief', EcoReliefContract.Contract).pipe(
  CompiledContract.withWitnesses(createVerifierWitnesses()),
  CompiledContract.withCompiledFileAssets('./managed/ecorelief'),
);
