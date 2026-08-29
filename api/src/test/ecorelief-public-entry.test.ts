/**
 * Proves the package boundary: the root entry (api/src/index.ts) stays
 * leaderboard-only, and every EcoRelief symbol is reachable only through the
 * dedicated EcoRelief entry (api/src/ecorelief-index.ts), never through
 * internal file paths and never bleeding into the root entry.
 */
import { describe, it, expect } from 'vitest';
import { LeaderboardAPI } from '../index';
import * as rootEntry from '../index';
import {
  EcoReliefApplicantAPI,
  EcoReliefVerifierAPI,
  mapLedgerToDerivedState,
  ecoReliefUtils,
  CLAIM_STATUS_LABELS,
  ecoReliefApplicantPrivateStateKey,
  ecoReliefVerifierPrivateStateKey,
} from '../ecorelief-index';

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe('Root entry (api/src/index.ts) stays leaderboard-only', () => {
  it('still exposes LeaderboardAPI and its static factories', () => {
    expect(typeof LeaderboardAPI).toBe('function');
    expect(typeof LeaderboardAPI.deploy).toBe('function');
    expect(typeof LeaderboardAPI.join).toBe('function');
  });

  it('does not export any EcoRelief symbol', () => {
    const exportNames = Object.keys(rootEntry);
    const ecoReliefNames = exportNames.filter((name) => name.toLowerCase().includes('ecorelief'));
    expect(ecoReliefNames).toEqual([]);
  });
});

describe('Dedicated EcoRelief entry (api/src/ecorelief-index.ts)', () => {
  it('exposes EcoReliefApplicantAPI and EcoReliefVerifierAPI as classes with their static factories', () => {
    expect(typeof EcoReliefApplicantAPI).toBe('function');
    expect(typeof EcoReliefApplicantAPI.join).toBe('function');
    expect(typeof EcoReliefVerifierAPI).toBe('function');
    expect(typeof EcoReliefVerifierAPI.deploy).toBe('function');
    expect(typeof EcoReliefVerifierAPI.join).toBe('function');
  });

  it('exposes CLAIM_STATUS_LABELS and both private-state key constants', () => {
    expect(CLAIM_STATUS_LABELS).toEqual(['Submitted', 'Under Review', 'Approved', 'Rejected', 'Processed']);
    expect(ecoReliefApplicantPrivateStateKey).toBe('ecoReliefApplicantPrivateState');
    expect(ecoReliefVerifierPrivateStateKey).toBe('ecoReliefVerifierPrivateState');
  });

  it('exposes ecoReliefUtils.bytesToHex under a collision-free namespace and it behaves correctly', () => {
    expect(ecoReliefUtils.bytesToHex(new Uint8Array([0, 255]))).toBe('00ff');
  });

  it('exposes a working mapLedgerToDerivedState', () => {
    const fakeLedger = {
      claims: {
        isEmpty: () => true,
        size: () => 0n,
        member: () => false,
        lookup: () => {
          throw new Error('no claims in this fake ledger');
        },
        [Symbol.iterator]: () => new Map<bigint, never>()[Symbol.iterator](),
      },
      usedNullifiers: {
        isEmpty: () => true,
        size: () => 0n,
        member: () => false,
        lookup: () => false,
        [Symbol.iterator]: () => new Map<Uint8Array, boolean>()[Symbol.iterator](),
      },
      claimCount: 0n,
      verifierAuthority: bytes32(0),
    };
    const derived = mapLedgerToDerivedState(fakeLedger);
    expect(derived.claimCount).toBe(0);
    expect(derived.claims).toEqual([]);
    expect(derived.verifierAuthority).toBe(ecoReliefUtils.bytesToHex(bytes32(0)));
  });
});
