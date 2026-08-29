import { describe, it, expect } from 'vitest';
import {
  assertValidNetworkId,
  assertValidWalletConfig,
  assertValidContractAddress,
  isValidContractAddress,
  EcoReliefConfigError,
} from './runtime-config';

describe('assertValidNetworkId', () => {
  it('accepts exactly "preprod"', () => {
    expect(() => assertValidNetworkId('preprod')).not.toThrow();
  });

  it.each([undefined, null, '', 'testnet', 'PREPROD', 'preprod ', 123])(
    'rejects %p',
    (value) => {
      expect(() => assertValidNetworkId(value)).toThrow(EcoReliefConfigError);
    },
  );
});

describe('assertValidWalletConfig', () => {
  const valid = {
    indexerUri: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWsUri: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    proverServerUri: 'https://zk-leaderboard-production.up.railway.app',
  };

  it('accepts a fully valid configuration', () => {
    expect(() => assertValidWalletConfig(valid)).not.toThrow();
  });

  it('rejects a missing proverServerUri instead of silently proceeding', () => {
    expect(() => assertValidWalletConfig({ ...valid, proverServerUri: undefined })).toThrow(EcoReliefConfigError);
  });

  it('rejects a missing indexerUri', () => {
    expect(() => assertValidWalletConfig({ ...valid, indexerUri: undefined })).toThrow(EcoReliefConfigError);
  });

  it('rejects a missing indexerWsUri', () => {
    expect(() => assertValidWalletConfig({ ...valid, indexerWsUri: undefined })).toThrow(EcoReliefConfigError);
  });

  it('rejects an indexer URL that is not HTTPS', () => {
    expect(() => assertValidWalletConfig({ ...valid, indexerUri: 'http://indexer.preprod.midnight.network' })).toThrow(
      EcoReliefConfigError,
    );
  });

  it('rejects an indexer websocket URL that is not WSS', () => {
    expect(() =>
      assertValidWalletConfig({ ...valid, indexerWsUri: 'ws://indexer.preprod.midnight.network/ws' }),
    ).toThrow(EcoReliefConfigError);
  });

  it('rejects a proof server URL that is not HTTPS', () => {
    expect(() => assertValidWalletConfig({ ...valid, proverServerUri: 'http://zk-leaderboard.example' })).toThrow(
      EcoReliefConfigError,
    );
  });

  it('rejects a malformed URL string', () => {
    expect(() => assertValidWalletConfig({ ...valid, proverServerUri: 'not a url' })).toThrow(EcoReliefConfigError);
  });
});

describe('contract address validation', () => {
  const good = 'a'.repeat(64);

  it('accepts exactly 64 hex characters', () => {
    expect(() => assertValidContractAddress(good)).not.toThrow();
    expect(isValidContractAddress(good)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(() => assertValidContractAddress('a'.repeat(63))).toThrow(EcoReliefConfigError);
    expect(isValidContractAddress('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidContractAddress('g'.repeat(64))).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidContractAddress(undefined)).toBe(false);
    expect(isValidContractAddress(123)).toBe(false);
  });
});
