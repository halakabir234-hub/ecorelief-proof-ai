import { describe, it, expect } from 'vitest';
import { friendlyError, extractErrorMessage, BASE_ERROR_RULES, type ErrorRule } from './friendly-error';

describe('extractErrorMessage', () => {
  it('extracts a plain Error message', () => {
    expect(extractErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('extracts a plain string', () => {
    expect(extractErrorMessage('plain string error')).toBe('plain string error');
  });

  it('unwraps an Effect-TS FiberFailure via cause.failure.message', () => {
    const e = { cause: { failure: { message: 'deep failure' } } };
    expect(extractErrorMessage(e)).toBe('deep failure');
  });

  it('unwraps a doubly-nested cause.failure.cause.message', () => {
    const e = { cause: { failure: { cause: { message: 'very deep failure' } } } };
    expect(extractErrorMessage(e)).toBe('very deep failure');
  });

  it('unwraps a plain cause.message', () => {
    const e = { cause: { message: 'shallow cause' } };
    expect(extractErrorMessage(e)).toBe('shallow cause');
  });

  it('does not crash on null/undefined/number', () => {
    expect(() => extractErrorMessage(null)).not.toThrow();
    expect(() => extractErrorMessage(undefined)).not.toThrow();
    expect(() => extractErrorMessage(42)).not.toThrow();
  });

  it('does not crash on a plain object with no recognizable message field', () => {
    expect(() => extractErrorMessage({ foo: 'bar' })).not.toThrow();
  });
});

describe('friendlyError', () => {
  it('maps a known base rule', () => {
    expect(friendlyError(new Error('User rejected the request'))).toBe('Transaction cancelled.');
  });

  it('falls back to the raw message when nothing matches', () => {
    expect(friendlyError(new Error('some totally novel failure'))).toBe('some totally novel failure');
  });

  it('checks extraRules before base rules', () => {
    const extra: ErrorRule[] = [{ test: (m) => m.includes('not authorized'), message: 'custom override' }];
    // 'not authorized' also matches a BASE_ERROR_RULES entry; extraRules must win.
    expect(friendlyError(new Error('not authorized verifier'), extra)).toBe('custom override');
  });

  it('every base rule is reachable with a matching sample message', () => {
    for (const rule of BASE_ERROR_RULES) {
      expect(rule.test).toBeTypeOf('function');
    }
  });

  it('accepts unknown-typed input without a compile-time any', () => {
    const raise = (): unknown => {
      throw new Error('typed as unknown in catch');
    };
    try {
      raise();
    } catch (e: unknown) {
      expect(friendlyError(e)).toBe('typed as unknown in catch');
    }
  });
});
