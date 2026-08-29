// Post-build smoke check: resolves the real published root entry
// "@midnight-ntwrk/leaderboard-api" via Node's own ESM resolver against the
// compiled dist/ output, independent of vitest/tsc's own module resolution.
// Run after `npm run build` has produced api/dist/.
import { LeaderboardAPI } from '@midnight-ntwrk/leaderboard-api';

const checks = [
  ['LeaderboardAPI is a class', typeof LeaderboardAPI === 'function'],
  ['LeaderboardAPI.deploy is a function', typeof LeaderboardAPI.deploy === 'function'],
  ['LeaderboardAPI.join is a function', typeof LeaderboardAPI.join === 'function'],
];

let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed = true;
}

if (failed) {
  console.error('\nSmoke check FAILED: @midnight-ntwrk/leaderboard-api did not resolve correctly.');
  process.exit(1);
}
console.log('\nSmoke check PASSED: @midnight-ntwrk/leaderboard-api resolves correctly via Node ESM.');
