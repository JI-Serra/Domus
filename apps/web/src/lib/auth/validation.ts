import type { AuthErrorKey } from './errors';

export const MIN_PASSWORD_LENGTH = 8;

// Deliberately simple: the auth server is the source of truth for deliverability.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): AuthErrorKey | null {
  const email = normalizeEmail(raw);
  if (!email) return 'emailRequired';
  return EMAIL_PATTERN.test(email) && email.length <= 254
    ? null
    : 'emailInvalid';
}

export function validateNewPassword(
  password: string,
  confirmation: string,
): AuthErrorKey | null {
  if (!password) return 'passwordRequired';
  if (password.length < MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  if (password !== confirmation) return 'passwordMismatch';
  return null;
}
