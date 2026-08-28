import { describe, it, expect, beforeEach } from 'vitest';
import { EcoReliefSimulator, ClaimStatus, verifierCommitment } from './ecorelief-simulator';

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe('EcoRelief contract simulator', () => {
  const verifierSecret = bytes32(10);
  const otherVerifierSecret = bytes32(11);
  const applicantA = bytes32(1);
  const applicantB = bytes32(2);
  const eventFlood = bytes32(20);
  const eventEarthquake = bytes32(21);
  const commitment1 = bytes32(30);
  const commitment2 = bytes32(31);
  const modelVersion = bytes32(40);

  let sim: EcoReliefSimulator;

  beforeEach(() => {
    const verifierHash = verifierCommitment(verifierSecret);
    sim = new EcoReliefSimulator(verifierHash);
  });

  describe('constructor', () => {
    it('atomically stores the verifier commitment at deploy so the correct secret is authorized immediately', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.moveToReview(verifierSecret, id)).not.toThrow();
    });

    it('does not authorize a secret other than the one committed at deploy', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.moveToReview(otherVerifierSecret, id)).toThrow('not authorized verifier');
    });
  });

  describe('submitClaim', () => {
    it('assigns the first claim ID as 1', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(id).toBe(1n);
    });

    it('increments claim IDs correctly across multiple claims', () => {
      const id1 = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      const id2 = sim.submitClaim(applicantB, commitment2, eventEarthquake, modelVersion, 2);
      expect(id1).toBe(1n);
      expect(id2).toBe(2n);
      expect(sim.getClaimCount()).toBe(2n);
    });

    it('rejects a duplicate claim from the same applicant secret for the same event', () => {
      sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.submitClaim(applicantA, commitment2, eventFlood, modelVersion, 1)).toThrow(
        'duplicate claim for this applicant and event',
      );
    });

    it('accepts the same applicant secret submitting for a different event', () => {
      sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.submitClaim(applicantA, commitment2, eventEarthquake, modelVersion, 1)).not.toThrow();
    });

    it('accepts a different applicant secret submitting for the same event', () => {
      sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.submitClaim(applicantB, commitment2, eventFlood, modelVersion, 1)).not.toThrow();
    });

    it('stores only the approved safe public fields, with no raw assessment data', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 3);
      const record = sim.getClaim(id)!;
      expect(Object.keys(record).sort()).toEqual(
        ['claimCommitment', 'eventCodeHash', 'modelVersionHash', 'priorityBand', 'status'].sort(),
      );
      expect(record.status).toBe(ClaimStatus.Submitted);
      expect(record.claimCommitment).toEqual(commitment1);
      expect(record.eventCodeHash).toEqual(eventFlood);
      expect(record.modelVersionHash).toEqual(modelVersion);
      expect(record.priorityBand).toBe(3);
    });
  });

  describe('verifyClaimOwnership', () => {
    it('succeeds for the applicant secret that actually submitted the claim', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.verifyClaimOwnership(applicantA, id)).not.toThrow();
    });

    it('fails for a different applicant secret', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.verifyClaimOwnership(applicantB, id)).toThrow('not the claim owner');
    });

    it('fails for a claim ID that does not exist', () => {
      expect(() => sim.verifyClaimOwnership(applicantA, 999n)).toThrow('claim not found');
    });
  });

  describe('authorization', () => {
    it('rejects an unauthorized verifier secret on every lifecycle circuit', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.moveToReview(otherVerifierSecret, id)).toThrow('not authorized verifier');
      sim.moveToReview(verifierSecret, id);
      expect(() => sim.approveClaim(otherVerifierSecret, id)).toThrow('not authorized verifier');
      expect(() => sim.rejectClaim(otherVerifierSecret, id)).toThrow('not authorized verifier');
      sim.approveClaim(verifierSecret, id);
      expect(() => sim.markProcessed(otherVerifierSecret, id)).toThrow('not authorized verifier');
    });
  });

  describe('lifecycle transitions — valid paths', () => {
    it('Submitted -> Under Review -> Approved -> Processed', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(sim.getClaim(id)!.status).toBe(ClaimStatus.Submitted);
      sim.moveToReview(verifierSecret, id);
      expect(sim.getClaim(id)!.status).toBe(ClaimStatus.UnderReview);
      sim.approveClaim(verifierSecret, id);
      expect(sim.getClaim(id)!.status).toBe(ClaimStatus.Approved);
      sim.markProcessed(verifierSecret, id);
      expect(sim.getClaim(id)!.status).toBe(ClaimStatus.Processed);
    });

    it('Submitted -> Under Review -> Rejected', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      sim.moveToReview(verifierSecret, id);
      sim.rejectClaim(verifierSecret, id);
      expect(sim.getClaim(id)!.status).toBe(ClaimStatus.Rejected);
    });
  });

  describe('lifecycle transitions — invalid paths', () => {
    it('rejects moveToReview unless the claim is Submitted', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      sim.moveToReview(verifierSecret, id);
      expect(() => sim.moveToReview(verifierSecret, id)).toThrow('claim not in submitted state');
    });

    it('rejects approveClaim unless the claim is Under Review', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.approveClaim(verifierSecret, id)).toThrow('claim not under review');
    });

    it('rejects rejectClaim unless the claim is Under Review', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      expect(() => sim.rejectClaim(verifierSecret, id)).toThrow('claim not under review');
    });

    it('rejects markProcessed unless the claim is Approved', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      sim.moveToReview(verifierSecret, id);
      expect(() => sim.markProcessed(verifierSecret, id)).toThrow('claim not approved');
    });

    it('rejects every lifecycle circuit for a missing claim ID', () => {
      expect(() => sim.moveToReview(verifierSecret, 999n)).toThrow('claim not found');
      expect(() => sim.approveClaim(verifierSecret, 999n)).toThrow('claim not found');
      expect(() => sim.rejectClaim(verifierSecret, 999n)).toThrow('claim not found');
      expect(() => sim.markProcessed(verifierSecret, 999n)).toThrow('claim not found');
    });
  });

  describe('terminal state enforcement', () => {
    it('treats Rejected as terminal — no further transitions succeed', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      sim.moveToReview(verifierSecret, id);
      sim.rejectClaim(verifierSecret, id);
      expect(() => sim.moveToReview(verifierSecret, id)).toThrow('claim not in submitted state');
      expect(() => sim.approveClaim(verifierSecret, id)).toThrow('claim not under review');
      expect(() => sim.markProcessed(verifierSecret, id)).toThrow('claim not approved');
    });

    it('treats Processed as terminal — no further transitions succeed', () => {
      const id = sim.submitClaim(applicantA, commitment1, eventFlood, modelVersion, 1);
      sim.moveToReview(verifierSecret, id);
      sim.approveClaim(verifierSecret, id);
      sim.markProcessed(verifierSecret, id);
      expect(() => sim.moveToReview(verifierSecret, id)).toThrow('claim not in submitted state');
      expect(() => sim.approveClaim(verifierSecret, id)).toThrow('claim not under review');
      expect(() => sim.rejectClaim(verifierSecret, id)).toThrow('claim not under review');
      expect(() => sim.markProcessed(verifierSecret, id)).toThrow('claim not approved');
    });
  });
});
