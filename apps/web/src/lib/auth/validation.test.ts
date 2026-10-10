import { describe, expect, it } from 'vitest';
import {
  normalizeEmail,
  readText,
  validateEmail,
  validateNewPassword,
} from './validation';

describe('validateEmail', () => {
  it('accepts a normal address, ignoring case and spaces', () => {
    expect(validateEmail('  Ana@Domus.Local ')).toBeNull();
    expect(normalizeEmail('  Ana@Domus.Local ')).toBe('ana@domus.local');
  });

  it.each([
    ['', 'emailRequired'],
    ['   ', 'emailRequired'],
    ['ana', 'emailInvalid'],
    ['ana@', 'emailInvalid'],
    ['ana@domus', 'emailInvalid'],
    ['a na@domus.local', 'emailInvalid'],
    [`${'a'.repeat(250)}@d.io`, 'emailInvalid'],
  ])('rejects %j with %s', (input, key) => {
    expect(validateEmail(input)).toBe(key);
  });
});

describe('validateNewPassword', () => {
  it('requires a password of at least 8 characters that matches its confirmation', () => {
    expect(validateNewPassword('', '')).toBe('passwordRequired');
    expect(validateNewPassword('corta', 'corta')).toBe('passwordTooShort');
    expect(validateNewPassword('suficiente1', 'otra-cosa-1')).toBe(
      'passwordMismatch',
    );
    expect(validateNewPassword('suficiente1', 'suficiente1')).toBeNull();
  });
});

describe('readText', () => {
  it('returns strings only', () => {
    const form = new FormData();
    form.set('a', 'x');
    form.set('file', new Blob(['x']), 'x.txt');
    expect(readText(form, 'a')).toBe('x');
    expect(readText(form, 'file')).toBe('');
    expect(readText(form, 'missing')).toBe('');
  });
});
