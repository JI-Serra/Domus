import type { AuthErrorKey } from './errors';

/** Result of a code form (challenge or enrollment verification), as returned to `useActionState`. */
export type CodeFormState =
  | { status: 'idle' }
  | { status: 'error'; error: AuthErrorKey; field: 'code' | 'form' }
  | { status: 'done' };

export const INITIAL_CODE_STATE: CodeFormState = { status: 'idle' };

/** What the enrollment needs to show: the QR (an SVG data URI), the manual secret and the factor to verify. */
export type EnrollmentStart =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: AuthErrorKey };

export type FactorRemoval = { ok: true } | { ok: false; error: AuthErrorKey };
