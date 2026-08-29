/**
 * Phase 1C EcoRelief test harness. This is intentionally minimal: a
 * connect/deploy/join/circuit-call surface for manual and future automated
 * verification, NOT a polished applicant assessment UI, verifier dashboard,
 * or AI scoring engine. Those are explicitly out of scope for this phase.
 */

import { useState } from 'react';
import ApplicantHarness from './ApplicantHarness';
import VerifierHarness from './VerifierHarness';
import './EcoRelief.css';

type Role = 'applicant' | 'verifier';

export default function EcoReliefHarness() {
  const [role, setRole] = useState<Role>('applicant');

  return (
    <div className="eh-app">
      <div className="eh-banner">
        EcoRelief Phase 1C technical harness — connection/deploy/join testing only.
        No fake or simulated blockchain state: every action below requires a real
        connected Lace wallet and produces (or fails to produce) a real transaction.
      </div>
      <div className="eh-tabs">
        <button className={`eh-tab ${role === 'applicant' ? 'active' : ''}`} onClick={() => setRole('applicant')}>
          Applicant
        </button>
        <button className={`eh-tab ${role === 'verifier' ? 'active' : ''}`} onClick={() => setRole('verifier')}>
          Verifier
        </button>
      </div>
      {role === 'applicant' ? <ApplicantHarness /> : <VerifierHarness />}
    </div>
  );
}
