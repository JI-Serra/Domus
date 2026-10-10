/**
 * What a platform Server Action hands back to `useActionState`. Error values are KEYS into the form's `errors`
 * messages (the action decides, the component words it in es-AR); raw database or function messages never travel.
 */
export type PlatformFormState =
  | { status: 'idle' }
  | {
      status: 'success';
      notice?: string;
      /** A value the answer carries once (e.g. a freshly generated unit code); never persisted by the form. */
      value?: string;
    }
  | {
      status: 'error';
      /** Field name → message key. */
      errors: Record<string, string>;
      /** Message key for a problem that belongs to the whole form. */
      formError?: string;
      /** What the user typed, so the form does not lose it. Never contains secrets. */
      values?: Record<string, string>;
    };

export const IDLE: PlatformFormState = { status: 'idle' };

export function formError(
  key: string,
  values?: Record<string, string>,
): PlatformFormState {
  return {
    status: 'error',
    errors: {},
    formError: key,
    ...(values ? { values } : {}),
  };
}

export function fieldError(
  errors: Record<string, string>,
  values?: Record<string, string>,
): PlatformFormState {
  return { status: 'error', errors, ...(values ? { values } : {}) };
}

/** Text fields of a submitted form as plain strings (files and repeated fields are left out). */
export function textValues(
  formData: FormData,
  names: readonly string[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    values[name] = typeof value === 'string' ? value : '';
  }
  return values;
}
