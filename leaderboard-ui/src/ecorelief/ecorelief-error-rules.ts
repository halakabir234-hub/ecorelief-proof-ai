import { type ErrorRule } from '../lib/friendly-error';

/**
 * Maps the exact `assert(...)` messages thrown by `contract/ecorelief.compact`
 * to user-facing copy. Checked before BASE_ERROR_RULES (see friendlyError's
 * `[...extraRules, ...BASE_ERROR_RULES]` ordering) so e.g. the specific
 * "not authorized verifier" message wins over the generic "not authorized"
 * base rule.
 */
export const ECORELIEF_ERROR_RULES: ErrorRule[] = [
  { test: (m) => m.includes('not authorized verifier'), message: 'This wallet is not the authorized verifier for this contract.' },
  { test: (m) => m.includes('claim not found'), message: 'Claim not found on this contract.' },
  { test: (m) => m.includes('claim not in submitted state'), message: 'This claim has already moved past Submitted.' },
  { test: (m) => m.includes('claim not under review'), message: 'This claim is not currently Under Review.' },
  { test: (m) => m.includes('claim not approved'), message: 'This claim has not been Approved yet.' },
  { test: (m) => m.includes('not the claim owner'), message: 'This claim does not belong to your applicant identity.' },
  { test: (m) => m.includes('duplicate claim for this applicant and event'), message: 'You have already submitted a claim for this event.' },
];
