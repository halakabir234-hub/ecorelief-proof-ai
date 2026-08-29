import { describe, it, expect } from 'vitest';
import {
  createApplicantWitnesses,
  createVerifierWitnesses,
  createEcoReliefApplicantPrivateState,
  createEcoReliefVerifierPrivateState,
} from '../src/ecorelief-witnesses';

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

describe('EcoRelief private state — validation and defensive copying', () => {
  describe('createEcoReliefApplicantPrivateState', () => {
    it('accepts a 32-byte secret', () => {
      const secret = bytes32(7);
      expect(() => createEcoReliefApplicantPrivateState(secret)).not.toThrow();
    });

    it('rejects a secret shorter than 32 bytes', () => {
      expect(() => createEcoReliefApplicantPrivateState(new Uint8Array(31))).toThrow(
        'applicantSecret must be exactly 32 bytes, got 31',
      );
    });

    it('rejects a secret longer than 32 bytes', () => {
      expect(() => createEcoReliefApplicantPrivateState(new Uint8Array(33))).toThrow(
        'applicantSecret must be exactly 32 bytes, got 33',
      );
    });

    it('rejects an empty secret', () => {
      expect(() => createEcoReliefApplicantPrivateState(new Uint8Array(0))).toThrow(
        'applicantSecret must be exactly 32 bytes, got 0',
      );
    });

    it('defensively copies the secret so caller mutation does not alter stored state', () => {
      const secret = bytes32(9);
      const state = createEcoReliefApplicantPrivateState(secret);
      expect(state.applicantSecret).toEqual(bytes32(9));
      secret[0] = 255;
      expect(state.applicantSecret[0]).toBe(9);
      expect(state.applicantSecret).not.toBe(secret);
    });

    it('has exactly one field: applicantSecret', () => {
      const state = createEcoReliefApplicantPrivateState(bytes32(1));
      expect(Object.keys(state)).toEqual(['applicantSecret']);
    });
  });

  describe('createEcoReliefVerifierPrivateState', () => {
    it('accepts a 32-byte secret', () => {
      const secret = bytes32(8);
      expect(() => createEcoReliefVerifierPrivateState(secret)).not.toThrow();
    });

    it('rejects a secret shorter than 32 bytes', () => {
      expect(() => createEcoReliefVerifierPrivateState(new Uint8Array(16))).toThrow(
        'verifierSecret must be exactly 32 bytes, got 16',
      );
    });

    it('rejects a secret longer than 32 bytes', () => {
      expect(() => createEcoReliefVerifierPrivateState(new Uint8Array(64))).toThrow(
        'verifierSecret must be exactly 32 bytes, got 64',
      );
    });

    it('defensively copies the secret so caller mutation does not alter stored state', () => {
      const secret = bytes32(11);
      const state = createEcoReliefVerifierPrivateState(secret);
      expect(state.verifierSecret).toEqual(bytes32(11));
      secret[0] = 254;
      expect(state.verifierSecret[0]).toBe(11);
      expect(state.verifierSecret).not.toBe(secret);
    });

    it('has exactly one field: verifierSecret', () => {
      const state = createEcoReliefVerifierPrivateState(bytes32(2));
      expect(Object.keys(state)).toEqual(['verifierSecret']);
    });
  });
});

describe('EcoRelief witnesses — role isolation', () => {
  describe('createApplicantWitnesses', () => {
    const witnesses = createApplicantWitnesses();

    it('getApplicantSecret returns the private state and the applicant secret', () => {
      const privateState = createEcoReliefApplicantPrivateState(bytes32(3));
      const [returnedState, secret] = witnesses.getApplicantSecret({ privateState });
      expect(returnedState).toBe(privateState);
      expect(secret).toEqual(bytes32(3));
    });

    it('getVerifierSecret throws, never fabricating or borrowing a verifier secret', () => {
      expect(() => witnesses.getVerifierSecret()).toThrow(
        'getVerifierSecret called in an applicant-role session, which never holds a verifier secret',
      );
    });
  });

  describe('createVerifierWitnesses', () => {
    const witnesses = createVerifierWitnesses();

    it('getVerifierSecret returns the private state and the verifier secret', () => {
      const privateState = createEcoReliefVerifierPrivateState(bytes32(4));
      const [returnedState, secret] = witnesses.getVerifierSecret({ privateState });
      expect(returnedState).toBe(privateState);
      expect(secret).toEqual(bytes32(4));
    });

    it('getApplicantSecret throws, never fabricating or borrowing an applicant secret', () => {
      expect(() => witnesses.getApplicantSecret()).toThrow(
        'getApplicantSecret called in a verifier-role session, which never holds an applicant secret',
      );
    });
  });
});
