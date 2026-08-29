// Post-build smoke check: resolves the real published subpath
// "@midnight-ntwrk/leaderboard-api/ecorelief" via Node's own ESM resolver
// against the compiled dist/ output (through the npm workspace symlink),
// independent of vitest/tsc's own module resolution. Run after `npm run
// build` has produced api/dist/.
import {
  EcoReliefApplicantAPI,
  EcoReliefVerifierAPI,
  mapLedgerToDerivedState,
  ecoReliefUtils,
  CLAIM_STATUS_LABELS,
} from '@midnight-ntwrk/leaderboard-api/ecorelief';

const checks = [
  ['EcoReliefApplicantAPI is a class', typeof EcoReliefApplicantAPI === 'function'],
  ['EcoReliefApplicantAPI.join is a function', typeof EcoReliefApplicantAPI.join === 'function'],
  ['EcoReliefVerifierAPI is a class', typeof EcoReliefVerifierAPI === 'function'],
  ['EcoReliefVerifierAPI.deploy is a function', typeof EcoReliefVerifierAPI.deploy === 'function'],
  ['EcoReliefVerifierAPI.join is a function', typeof EcoReliefVerifierAPI.join === 'function'],
  ['mapLedgerToDerivedState is a function', typeof mapLedgerToDerivedState === 'function'],
  ['ecoReliefUtils.bytesToHex is a function', typeof ecoReliefUtils.bytesToHex === 'function'],
  ['CLAIM_STATUS_LABELS has 5 entries', Array.isArray(CLAIM_STATUS_LABELS) && CLAIM_STATUS_LABELS.length === 5],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSmoke check FAILED: @midnight-ntwrk/leaderboard-api/ecorelief did not resolve correctly.');
  process.exit(1);
}
console.log('\nSmoke check PASSED: @midnight-ntwrk/leaderboard-api/ecorelief resolves correctly via Node ESM.');
