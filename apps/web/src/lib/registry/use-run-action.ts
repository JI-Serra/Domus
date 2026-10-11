'use client';

import { useState, useTransition } from 'react';
import type { PlatformFormState } from '@/lib/platform/form-state';

/**
 * Runs a Server Action that is not a form (a confirmation button, an approve / reject pair) and keeps its outcome:
 * `error` is the message key of the last failure (`registry.errors.*`), `notice` the key of the last success
 * (`registry.notices.*`) and `value` what that success carried once (a freshly generated code). A new run clears
 * the previous outcome.
 */
export function useRunAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);

  const run = (
    action: () => Promise<PlatformFormState>,
    onSuccess?: (
      state: Extract<PlatformFormState, { status: 'success' }>,
    ) => void,
  ) => {
    setError(null);
    setNotice(null);
    setValue(null);
    startTransition(async () => {
      const state = await action();
      if (state.status === 'error') {
        setError(state.formError ?? 'unknown');
        return;
      }
      if (state.status === 'success') {
        setNotice(state.notice ?? null);
        setValue(state.value ?? null);
        onSuccess?.(state);
      }
    });
  };
  const clear = () => {
    setError(null);
    setNotice(null);
    setValue(null);
  };
  return { run, pending, error, notice, value, clear };
}
