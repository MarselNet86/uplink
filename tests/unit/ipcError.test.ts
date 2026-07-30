import { describe, expect, it } from 'vitest';
import { decodeAppError, encodeAppError } from '@shared/ipcError';

describe('encodeAppError / decodeAppError', () => {
  it('round-trips a plain AppError', () => {
    const error = { code: 'E_SSH_AUTH' as const, message: 'auth failed' };
    expect(decodeAppError(encodeAppError(error))).toEqual(error);
  });

  it('decodes through Electron-style error message wrapping', () => {
    const encoded = encodeAppError({ code: 'E_TIMEOUT', message: 'timed out', hint: 'retry' });
    const wrapped = `Error invoking remote method 'ssh:check': Error: ${encoded}`;
    expect(decodeAppError(wrapped)).toEqual({
      code: 'E_TIMEOUT',
      message: 'timed out',
      hint: 'retry',
    });
  });

  it('returns null for a message without the marker', () => {
    expect(decodeAppError('plain error message')).toBeNull();
  });

  it('returns null for malformed JSON after the marker', () => {
    expect(decodeAppError('UPLINK_APP_ERROR:{not json')).toBeNull();
  });
});
