import { useState, useRef, useCallback, useEffect } from 'react';
import pino from 'pino';
import { BrowserEcoReliefVerifierManager, type EcoReliefVerifierConnection } from '../contexts/BrowserEcoReliefVerifierManager';
import { friendlyError } from '../lib/friendly-error';
import { ECORELIEF_ERROR_RULES } from './ecorelief-error-rules';
import { assertValidContractAddress } from '../lib/runtime-config';

type ClaimAction = 'moveToReview' | 'approveClaim' | 'rejectClaim' | 'markProcessed';

export default function VerifierHarness() {
  const managerRef = useRef<BrowserEcoReliefVerifierManager | null>(null);
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      const logger = pino({ level: 'warn', browser: { asObject: true } });
      managerRef.current = new BrowserEcoReliefVerifierManager(logger);
    }
    return managerRef.current;
  }, []);

  const [secretStatus, setSecretStatus] = useState(() => getManager().secretStatus());
  const [connection, setConnection] = useState<EcoReliefVerifierConnection>({ status: 'idle' });
  const [log, setLog] = useState<string[]>([]);
  const [contractAddress, setContractAddress] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [claimIdInput, setClaimIdInput] = useState('');

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-49), line]);
  }, []);

  useEffect(() => {
    const sub = getManager().connection$.subscribe(setConnection);
    return () => sub.unsubscribe();
  }, [getManager]);

  useEffect(() => {
    if (connection.status !== 'connected') return undefined;
    const sub = connection.api.state$.subscribe((state) => appendLog(`state: ${JSON.stringify(state)}`));
    return () => sub.unsubscribe();
  }, [connection, appendLog]);

  const refreshSecretStatus = useCallback(() => setSecretStatus(getManager().secretStatus()), [getManager]);

  const handleUnlock = useCallback(async () => {
    try {
      await getManager().unlock(unlockPassphrase);
      setUnlockPassphrase('');
      refreshSecretStatus();
      appendLog('Vault unlocked.');
    } catch (e) {
      appendLog(`ERROR unlocking vault: ${friendlyError(e)}`);
    }
  }, [getManager, unlockPassphrase, refreshSecretStatus, appendLog]);

  const handleSaveVault = useCallback(async () => {
    if (passphrase !== confirmPassphrase) {
      appendLog('ERROR: passphrase and confirmation do not match.');
      return;
    }
    try {
      await getManager().saveVault(passphrase);
      setPassphrase('');
      setConfirmPassphrase('');
      appendLog('Vault saved.');
    } catch (e) {
      appendLog(`ERROR saving vault: ${friendlyError(e)}`);
    }
  }, [getManager, passphrase, confirmPassphrase, appendLog]);

  const handleLock = useCallback(() => {
    getManager().lock();
    refreshSecretStatus();
    appendLog('Locked.');
  }, [getManager, refreshSecretStatus, appendLog]);

  const handleNewIdentity = useCallback(() => {
    getManager().generateNewIdentity();
    refreshSecretStatus();
    appendLog('Generated a new verifier identity (previous vault cleared). Note: this abandons on-chain verifierAuthority for any previously deployed contract.');
  }, [getManager, refreshSecretStatus, appendLog]);

  const handleDeploy = useCallback(() => {
    getManager().deploy();
  }, [getManager]);

  const handleJoin = useCallback(() => {
    try {
      const trimmed = contractAddress.trim();
      assertValidContractAddress(trimmed);
      getManager().join(trimmed);
    } catch (e) {
      appendLog(`ERROR: ${friendlyError(e, ECORELIEF_ERROR_RULES)}`);
    }
  }, [contractAddress, getManager, appendLog]);

  const runClaimAction = useCallback(
    async (action: ClaimAction) => {
      if (connection.status !== 'connected') {
        appendLog('ERROR: not connected.');
        return;
      }
      try {
        const claimId = BigInt(claimIdInput);
        await connection.api[action](claimId);
        appendLog(`${action} OK for claimId=${claimIdInput}`);
      } catch (e) {
        appendLog(`ERROR ${action}: ${friendlyError(e, ECORELIEF_ERROR_RULES)}`);
      }
    },
    [connection, claimIdInput, appendLog],
  );

  return (
    <div>
      <div className="eh-banner">
        Encryption protects the saved vault at rest. It cannot protect the secret from malicious
        same-origin JavaScript/XSS while a vault is unlocked (the secret sits in ordinary page memory
        once unlocked).
      </div>

      <div className="eh-section">
        <h3>Verifier Identity ({secretStatus})</h3>
        {secretStatus === 'locked' && (
          <div className="eh-row">
            <input
              type="password"
              placeholder="Recovery passphrase"
              value={unlockPassphrase}
              onChange={(e) => setUnlockPassphrase(e.target.value)}
            />
            <button onClick={handleUnlock} disabled={!unlockPassphrase}>
              Unlock
            </button>
          </div>
        )}
        {secretStatus === 'unlocked' && (
          <>
            <div className="eh-row">
              <input
                type="password"
                placeholder="New recovery passphrase (min 12 chars)"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
              />
              <button onClick={handleSaveVault} disabled={passphrase.length < 12 || passphrase !== confirmPassphrase}>
                Save Vault
              </button>
            </div>
            <div className="eh-row">
              <button onClick={handleLock}>Lock</button>
              <button onClick={handleNewIdentity}>Generate New Identity</button>
            </div>
          </>
        )}
        {secretStatus === 'no-vault' && (
          <div className="eh-row">
            <button onClick={handleNewIdentity}>Generate New Identity</button>
          </div>
        )}
      </div>

      <div className="eh-section">
        <h3>Deploy / Join Contract</h3>
        <div className="eh-row">
          <button onClick={handleDeploy} disabled={secretStatus !== 'unlocked'}>
            Deploy New Contract
          </button>
        </div>
        <div className="eh-row">
          <input
            placeholder="Contract address (64 hex chars)"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
          />
          <button onClick={handleJoin} disabled={secretStatus !== 'unlocked'}>
            Join
          </button>
        </div>
        <div className="eh-status">
          connection: {connection.status}
          {connection.status === 'connected' && ` (${connection.api.deployedContractAddress})`}
        </div>
      </div>

      <div className="eh-section">
        <h3>Claim Lifecycle Actions</h3>
        <div className="eh-row">
          <input placeholder="claimId" value={claimIdInput} onChange={(e) => setClaimIdInput(e.target.value)} />
        </div>
        <div className="eh-row">
          <button onClick={() => runClaimAction('moveToReview')} disabled={connection.status !== 'connected'}>
            Move To Review
          </button>
          <button onClick={() => runClaimAction('approveClaim')} disabled={connection.status !== 'connected'}>
            Approve
          </button>
          <button onClick={() => runClaimAction('rejectClaim')} disabled={connection.status !== 'connected'}>
            Reject
          </button>
          <button onClick={() => runClaimAction('markProcessed')} disabled={connection.status !== 'connected'}>
            Mark Processed
          </button>
        </div>
      </div>

      <div className="eh-section">
        <h3>Log</h3>
        <div className="eh-log">{log.length === 0 ? '(empty)' : log.join('\n')}</div>
      </div>
    </div>
  );
}
