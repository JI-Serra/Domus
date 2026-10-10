import type { AuthErrorKey } from './errors';

/** Fields an error can be attached to; `form` means the error belongs to the whole form. */
export type AuthErrorField = 'email' | 'password' | 'confirmPassword' | 'form';

/** State returned by the auth server actions to `useActionState`. */
export type AuthFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      error: AuthErrorKey;
      field: AuthErrorField;
      /** Echoed back so the form keeps what the user typed (never the password). */
      email: string;
    }
  | { status: 'sent'; email: string };

export const INITIAL_AUTH_STATE: AuthFormState = { status: 'idle' };
