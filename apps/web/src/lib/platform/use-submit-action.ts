'use client';

import { useActionState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { IDLE } from './form-state';
import type { PlatformFormState } from './form-state';

/**
 * `useActionState` for a platform form that must keep what the user typed after a failed submit. React 19 resets a
 * form whose `action` finished, which would blank controlled inputs (and desynchronize selects from their state);
 * here the submit is intercepted and the action is dispatched by hand, so the fields stay as they are. The server's
 * answer decides what changes (errors, echoed values).
 */
export function useSubmitAction(
  action: (
    previous: PlatformFormState,
    formData: FormData,
  ) => Promise<PlatformFormState>,
) {
  const [state, dispatch, actionPending] = useActionState(action, IDLE);
  const [transitionPending, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, onSubmit, pending: actionPending || transitionPending };
}
