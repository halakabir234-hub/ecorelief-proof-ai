/**
 * Offline tests for EcoReliefApplicantAPI/EcoReliefVerifierAPI's deploy/join
 * entry points, using the fully-typed mock provider bundle from
 * ecorelief-mock-providers.ts.
 *
 * Scope, deliberately: these tests only exercise behavior that is guaranteed
 * (by reading the source of api/src/ecorelief.ts) to happen BEFORE any real
 * network/proof-server call — private-state construction/validation, which
 * runs synchronously as part of building the options object passed to
 * `findDeployedContract`/`deployContract`. They do not attempt to drive a
 * real deploy/join to completion, since that requires actual ZK proving and
 * a live proof server/indexer — see Phase 1C's live-verification checklist.
 */
import { describe, it, expect } from 'vitest';
import { EcoReliefApplicantAPI, EcoReliefVerifierAPI } from '../ecorelief.js';
import { EcoRelief } from 'leaderboard-contract/ecorelief';
import { makeMockApplicantProviders, makeMockVerifierProviders } from './ecorelief-mock-providers.js';

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

const FAKE_ADDRESS = '0'.repeat(64);

describe('EcoReliefApplicantAPI.join — private-state validation happens before any provider call', () => {
  it('rejects a too-short applicant secret without touching the providers', async () => {
    const providers = makeMockApplicantProviders();
    await expect(EcoReliefApplicantAPI.join(providers, FAKE_ADDRESS, new Uint8Array(16))).rejects.toThrow(
      /applicantSecret must be exactly 32 bytes/,
    );
  });

  it('rejects a too-long applicant secret without touching the providers', async () => {
    const providers = makeMockApplicantProviders();
    await expect(EcoReliefApplicantAPI.join(providers, FAKE_ADDRESS, new Uint8Array(64))).rejects.toThrow(
      /applicantSecret must be exactly 32 bytes/,
    );
  });

  it('proceeds past private-state validation with a correctly-sized secret and reaches the (unimplemented) provider layer', async () => {
    const providers = makeMockApplicantProviders();
    // A valid-length secret means findDeployedContract is actually invoked; it will fail inside
    // the mock's intentionally-throwing publicDataProvider/proofProvider rather than at our own
    // validation step. Either failure mode proves the call reached past private-state construction.
    await expect(EcoReliefApplicantAPI.join(providers, FAKE_ADDRESS, bytes32(1))).rejects.not.toThrow(
      /applicantSecret must be exactly 32 bytes/,
    );
  });
});

describe('EcoReliefVerifierAPI.deploy / join — rejects a bad secret before any provider call', () => {
  it('deploy rejects a too-short verifier secret without touching the providers', async () => {
    // deploy() computes EcoRelief.pureCircuits.verifierCommitment(verifierSecret) BEFORE
    // createEcoReliefVerifierPrivateState(verifierSecret), so a wrong-length secret is caught
    // by the compiled circuit's own Bytes<32> runtime type check first, not our assertSecretLength
    // message (that still applies to join(), and to submitClaim's other Bytes<32> args) — either
    // way, the rejection happens before deployContract/the mock providers are ever reached.
    const providers = makeMockVerifierProviders();
    await expect(EcoReliefVerifierAPI.deploy(providers, new Uint8Array(8))).rejects.toThrow();
  });

  it('join rejects a too-long verifier secret without touching the providers', async () => {
    const providers = makeMockVerifierProviders();
    await expect(EcoReliefVerifierAPI.join(providers, FAKE_ADDRESS, new Uint8Array(40))).rejects.toThrow(
      /verifierSecret must be exactly 32 bytes/,
    );
  });
});

describe('EcoRelief.pureCircuits.verifierCommitment — the value baked into deploy() args', () => {
  it('is deterministic: the same secret always produces the same commitment', () => {
    const a = EcoRelief.pureCircuits.verifierCommitment(bytes32(7));
    const b = EcoRelief.pureCircuits.verifierCommitment(bytes32(7));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different commitments for different secrets', () => {
    const a = EcoRelief.pureCircuits.verifierCommitment(bytes32(7));
    const b = EcoRelief.pureCircuits.verifierCommitment(bytes32(8));
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('produces 32-byte output', () => {
    expect(EcoRelief.pureCircuits.verifierCommitment(bytes32(1))).toHaveLength(32);
  });
});
