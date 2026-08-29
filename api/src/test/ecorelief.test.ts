import { describe, it, expect } from 'vitest';
import { bytesToHex } from '../utils/ecorelief';
import { mapLedgerToDerivedState } from '../ecorelief';
import { type EcoRelief } from 'leaderboard-contract/ecorelief';

type ClaimRecordShape = {
  status: bigint;
  claimCommitment: Uint8Array;
  eventCodeHash: Uint8Array;
  modelVersionHash: Uint8Array;
  priorityBand: bigint;
};

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function fakeClaimsMap(entries: [bigint, ClaimRecordShape][]): EcoRelief.Ledger['claims'] {
  const map = new Map(entries);
  return {
    isEmpty: () => map.size === 0,
    size: () => BigInt(map.size),
    member: (key: bigint) => map.has(key),
    lookup: (key: bigint) => {
      const value = map.get(key);
      if (!value) {
        throw new Error(`no fake claim for key ${key}`);
      }
      return value;
    },
    [Symbol.iterator]: () => map[Symbol.iterator](),
  };
}

function fakeLedger(
  claims: [bigint, ClaimRecordShape][],
  claimCount: bigint,
  verifierAuthority: Uint8Array,
): EcoRelief.Ledger {
  return {
    claims: fakeClaimsMap(claims),
    usedNullifiers: {
      isEmpty: () => true,
      size: () => 0n,
      member: () => false,
      lookup: () => false,
      [Symbol.iterator]: () => new Map<Uint8Array, boolean>()[Symbol.iterator](),
    },
    claimCount,
    verifierAuthority,
  };
}

describe('bytesToHex', () => {
  it('encodes an all-zero byte array', () => {
    expect(bytesToHex(new Uint8Array(4))).toBe('00000000');
  });

  it('encodes an all-0xff byte array', () => {
    expect(bytesToHex(new Uint8Array(4).fill(0xff))).toBe('ffffffff');
  });

  it('encodes known byte values with correct padding', () => {
    expect(bytesToHex(new Uint8Array([0x01, 0xab, 0x00, 0x0f]))).toBe('01ab000f');
  });
});

describe('mapLedgerToDerivedState', () => {
  it('maps claimCount and verifierAuthority through', () => {
    const authority = bytes32(5);
    const derived = mapLedgerToDerivedState(fakeLedger([], 3n, authority));
    expect(derived.claimCount).toBe(3);
    expect(derived.verifierAuthority).toBe(bytesToHex(authority));
    expect(derived.claims).toEqual([]);
  });

  it('maps every claim field and hex-encodes every Bytes<32> field', () => {
    const record: ClaimRecordShape = {
      status: 0n,
      claimCommitment: bytes32(1),
      eventCodeHash: bytes32(2),
      modelVersionHash: bytes32(3),
      priorityBand: 2n,
    };
    const derived = mapLedgerToDerivedState(fakeLedger([[1n, record]], 1n, bytes32(9)));
    expect(derived.claims).toHaveLength(1);
    const claim = derived.claims[0];
    expect(claim.claimId).toBe('1');
    expect(claim.status).toBe(0);
    expect(claim.statusLabel).toBe('Submitted');
    expect(claim.claimCommitment).toBe(bytesToHex(bytes32(1)));
    expect(claim.eventCodeHash).toBe(bytesToHex(bytes32(2)));
    expect(claim.modelVersionHash).toBe(bytesToHex(bytes32(3)));
    expect(claim.priorityBand).toBe(2);
  });

  it.each([
    [0, 'Submitted'],
    [1, 'Under Review'],
    [2, 'Approved'],
    [3, 'Rejected'],
    [4, 'Processed'],
  ])('maps status code %i to label %s', (status, label) => {
    const record: ClaimRecordShape = {
      status: BigInt(status),
      claimCommitment: bytes32(1),
      eventCodeHash: bytes32(2),
      modelVersionHash: bytes32(3),
      priorityBand: 0n,
    };
    const derived = mapLedgerToDerivedState(fakeLedger([[1n, record]], 1n, bytes32(0)));
    expect(derived.claims[0].statusLabel).toBe(label);
  });

  it('falls back to Unknown for an out-of-range status code', () => {
    const record: ClaimRecordShape = {
      status: 99n,
      claimCommitment: bytes32(1),
      eventCodeHash: bytes32(2),
      modelVersionHash: bytes32(3),
      priorityBand: 0n,
    };
    const derived = mapLedgerToDerivedState(fakeLedger([[1n, record]], 1n, bytes32(0)));
    expect(derived.claims[0].statusLabel).toBe('Unknown');
  });
});
