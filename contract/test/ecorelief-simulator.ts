/**
 * Hand-rolled TypeScript mirror of ecorelief.compact's logic, in the same
 * style as leaderboard-simulator.ts. The hash below is a deterministic
 * placeholder for testing ordering/uniqueness/rule logic off-chain — it is
 * NOT the real ZK-friendly persistentHash used on-chain.
 */

export const ClaimStatus = {
  Submitted: 0,
  UnderReview: 1,
  Approved: 2,
  Rejected: 3,
  Processed: 4,
} as const;

export interface ClaimRecord {
  status: number;
  claimCommitment: Uint8Array;
  eventCodeHash: Uint8Array;
  modelVersionHash: Uint8Array;
  priorityBand: number;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function toyHash(...parts: Uint8Array[]): Uint8Array {
  let h = 0n;
  for (const part of parts) {
    for (const byte of part) {
      h = (h * 31n + BigInt(byte)) % 2n ** 252n;
    }
  }
  const out = new Uint8Array(32);
  let v = h;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function pad32(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(bytes.slice(0, 32));
  return out;
}

const DOMAIN_NULLIFIER = pad32(new TextEncoder().encode('ecorelief:nullifier:'));
const DOMAIN_VERIFIER = pad32(new TextEncoder().encode('ecorelief:verifier:'));

export function applicantNullifier(secret: Uint8Array, eventCodeHash: Uint8Array): Uint8Array {
  return toyHash(DOMAIN_NULLIFIER, secret, eventCodeHash);
}

export function verifierCommitment(secret: Uint8Array): Uint8Array {
  return toyHash(DOMAIN_VERIFIER, secret);
}

function nullifierKey(nullifier: Uint8Array): string {
  return Buffer.from(nullifier).toString('hex');
}

export class EcoReliefSimulator {
  private claims = new Map<bigint, ClaimRecord>();
  private usedNullifiers = new Set<string>();
  private claimCount = 0n;
  private readonly verifierAuthority: Uint8Array;

  constructor(verifierHash: Uint8Array) {
    this.verifierAuthority = verifierHash;
  }

  submitClaim(
    applicantSecret: Uint8Array,
    claimCommitment: Uint8Array,
    eventCodeHash: Uint8Array,
    modelVersionHash: Uint8Array,
    priorityBand: number,
  ): bigint {
    const nullifier = applicantNullifier(applicantSecret, eventCodeHash);
    const key = nullifierKey(nullifier);
    if (this.usedNullifiers.has(key)) {
      throw new Error('duplicate claim for this applicant and event');
    }
    this.usedNullifiers.add(key);

    this.claimCount += 1n;
    const claimId = this.claimCount;

    this.claims.set(claimId, {
      status: ClaimStatus.Submitted,
      claimCommitment,
      eventCodeHash,
      modelVersionHash,
      priorityBand,
    });

    return claimId;
  }

  private requireClaim(claimId: bigint): ClaimRecord {
    const entry = this.claims.get(claimId);
    if (!entry) {
      throw new Error('claim not found');
    }
    return entry;
  }

  private requireVerifier(verifierSecret: Uint8Array): void {
    if (!bytesEqual(verifierCommitment(verifierSecret), this.verifierAuthority)) {
      throw new Error('not authorized verifier');
    }
  }

  moveToReview(verifierSecret: Uint8Array, claimId: bigint): void {
    this.requireVerifier(verifierSecret);
    const entry = this.requireClaim(claimId);
    if (entry.status !== ClaimStatus.Submitted) {
      throw new Error('claim not in submitted state');
    }
    this.claims.set(claimId, { ...entry, status: ClaimStatus.UnderReview });
  }

  approveClaim(verifierSecret: Uint8Array, claimId: bigint): void {
    this.requireVerifier(verifierSecret);
    const entry = this.requireClaim(claimId);
    if (entry.status !== ClaimStatus.UnderReview) {
      throw new Error('claim not under review');
    }
    this.claims.set(claimId, { ...entry, status: ClaimStatus.Approved });
  }

  rejectClaim(verifierSecret: Uint8Array, claimId: bigint): void {
    this.requireVerifier(verifierSecret);
    const entry = this.requireClaim(claimId);
    if (entry.status !== ClaimStatus.UnderReview) {
      throw new Error('claim not under review');
    }
    this.claims.set(claimId, { ...entry, status: ClaimStatus.Rejected });
  }

  markProcessed(verifierSecret: Uint8Array, claimId: bigint): void {
    this.requireVerifier(verifierSecret);
    const entry = this.requireClaim(claimId);
    if (entry.status !== ClaimStatus.Approved) {
      throw new Error('claim not approved');
    }
    this.claims.set(claimId, { ...entry, status: ClaimStatus.Processed });
  }

  verifyClaimOwnership(applicantSecret: Uint8Array, claimId: bigint): void {
    const entry = this.requireClaim(claimId);
    const nullifier = applicantNullifier(applicantSecret, entry.eventCodeHash);
    if (!this.usedNullifiers.has(nullifierKey(nullifier))) {
      throw new Error('not the claim owner');
    }
  }

  getClaim(claimId: bigint): ClaimRecord | undefined {
    return this.claims.get(claimId);
  }

  getClaimCount(): bigint {
    return this.claimCount;
  }
}
