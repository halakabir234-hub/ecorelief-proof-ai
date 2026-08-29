/**
 * Public entry point for the EcoRelief API, exposed as the package subpath
 * `@midnight-ntwrk/leaderboard-api/ecorelief`.
 *
 * Kept fully separate from the package's root entry (./index.ts) so that
 * existing leaderboard consumers importing the package's "." entry never
 * pull in any EcoRelief module — leaderboard-only there, EcoRelief-only here.
 *
 * @packageDocumentation
 */

export { EcoReliefApplicantAPI, EcoReliefVerifierAPI, mapLedgerToDerivedState } from './ecorelief.js';
export * as ecoReliefUtils from './utils/ecorelief.js';
export * from './ecorelief-common-types.js';
