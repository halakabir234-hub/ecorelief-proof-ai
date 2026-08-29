import { describe, it, expect, afterEach } from 'vitest';
import { getAnyWallet, getFirstCompatibleWallet, COMPATIBLE_CONNECTOR_API_VERSION } from './wallet-connect';

function setMidnight(value: Record<string, unknown> | undefined): void {
  Object.defineProperty(window, 'midnight', { value, configurable: true, writable: true });
}

describe('getAnyWallet', () => {
  afterEach(() => setMidnight(undefined));

  it('returns undefined when window.midnight is absent', () => {
    setMidnight(undefined);
    expect(getAnyWallet()).toBeUndefined();
  });

  it('returns undefined when no entry looks like a wallet', () => {
    setMidnight({ notAWallet: {} });
    expect(getAnyWallet()).toBeUndefined();
  });

  it('finds an entry with an apiVersion regardless of its value', () => {
    const fake = { apiVersion: '0.0.1' };
    setMidnight({ lace: fake });
    expect(getAnyWallet()).toBe(fake);
  });
});

describe('getFirstCompatibleWallet', () => {
  afterEach(() => setMidnight(undefined));

  it('returns undefined when window.midnight is absent', () => {
    setMidnight(undefined);
    expect(getFirstCompatibleWallet()).toBeUndefined();
  });

  it('rejects a wallet whose apiVersion does not satisfy the compatible range', () => {
    setMidnight({ lace: { apiVersion: '3.0.0' } });
    expect(getFirstCompatibleWallet()).toBeUndefined();
  });

  it('accepts a wallet whose apiVersion satisfies the compatible range', () => {
    const fake = { apiVersion: '4.2.0' };
    setMidnight({ lace: fake });
    expect(getFirstCompatibleWallet()).toBe(fake);
    expect(COMPATIBLE_CONNECTOR_API_VERSION).toBe('4.x');
  });

  it('ignores incompatible wallets and finds a compatible one among several', () => {
    const incompatible = { apiVersion: '1.0.0' };
    const compatible = { apiVersion: '4.5.0' };
    setMidnight({ old: incompatible, lace: compatible });
    expect(getFirstCompatibleWallet()).toBe(compatible);
  });
});
