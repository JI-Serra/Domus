'use client';

import { useEffect, useRef } from 'react';
import type { PlatformFormState } from '@/lib/platform/form-state';

/** Calls `onSuccess` once for each successful answer of a form (to close its sheet, to show what the answer carried). */
export function useOnSuccess(
  state: PlatformFormState,
  onSuccess: (state: Extract<PlatformFormState, { status: 'success' }>) => void,
) {
  const callback = useRef(onSuccess);
  useEffect(() => {
    callback.current = onSuccess;
  });
  useEffect(() => {
    if (state.status === 'success') callback.current(state);
  }, [state]);
}
