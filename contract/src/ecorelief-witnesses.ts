const SECRET_LENGTH = 32;

function assertSecretLength(secret: Uint8Array, label: string): void {
  if (secret.length !== SECRET_LENGTH) {
    throw new Error(`${label} must be exactly ${SECRET_LENGTH} bytes, got ${secret.length}`);
  }
}

export type EcoReliefApplicantPrivateState = {
  readonly applicantSecret: Uint8Array;
};

export type EcoReliefVerifierPrivateState = {
  readonly verifierSecret: Uint8Array;
};

/**
 * Validates length and defensively copies the secret so later mutation of the
 * caller's Uint8Array cannot alter stored private state.
 */
export const createEcoReliefApplicantPrivateState = (applicantSecret: Uint8Array): EcoReliefApplicantPrivateState => {
  assertSecretLength(applicantSecret, 'applicantSecret');
  return { applicantSecret: applicantSecret.slice() };
};

/**
 * Validates length and defensively copies the secret so later mutation of the
 * caller's Uint8Array cannot alter stored private state.
 */
export const createEcoReliefVerifierPrivateState = (verifierSecret: Uint8Array): EcoReliefVerifierPrivateState => {
  assertSecretLength(verifierSecret, 'verifierSecret');
  return { verifierSecret: verifierSecret.slice() };
};

/**
 * An applicant-role session never holds a verifier secret. getVerifierSecret
 * fails loudly rather than fabricate, borrow, or silently no-op — a circuit
 * that needs verifier authorization simply cannot run in this role.
 */
export const createApplicantWitnesses = () => ({
  getApplicantSecret: (
    { privateState }: { privateState: EcoReliefApplicantPrivateState },
  ): [EcoReliefApplicantPrivateState, Uint8Array] => [privateState, privateState.applicantSecret],
  getVerifierSecret: (): never => {
    throw new Error(
      'getVerifierSecret called in an applicant-role session, which never holds a verifier secret',
    );
  },
});

/** Mirror image of createApplicantWitnesses, for a verifier-role session. */
export const createVerifierWitnesses = () => ({
  getApplicantSecret: (): never => {
    throw new Error(
      'getApplicantSecret called in a verifier-role session, which never holds an applicant secret',
    );
  },
  getVerifierSecret: (
    { privateState }: { privateState: EcoReliefVerifierPrivateState },
  ): [EcoReliefVerifierPrivateState, Uint8Array] => [privateState, privateState.verifierSecret],
});
