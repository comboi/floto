import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';
import { statusExportFailed, statusRenderFailed } from './statusMessages';

describe('errorMessage (D.1)', () => {
  it('passes plain string errors through unchanged', () => {
    expect(errorMessage('boom')).toBe('boom');
  });

  it('reads message from the structured { code, message } shape', () => {
    expect(errorMessage({ code: 'DECODE', message: 'bad file' })).toBe('bad file');
  });

  it('falls back to String() for anything else', () => {
    expect(errorMessage(42)).toBe('42');
  });

  it('keeps the status message prefix for failures in both shapes', () => {
    expect(statusRenderFailed({ code: 'X', message: 'out of memory' })).toBe('RENDER FAILED: out of memory');
    expect(statusExportFailed('disk full')).toBe('EXPORT FAILED: disk full');
  });
});
