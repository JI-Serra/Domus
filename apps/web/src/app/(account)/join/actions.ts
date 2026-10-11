'use server';

import { joinRequestFormSchema } from '@domus/domain/household';
import { fieldErrors } from '@domus/domain/platform';
import { reportError } from '@domus/observability';
import { revalidatePath } from 'next/cache';
import { getRequestContext } from '@/lib/context/request-context';
import { cancelJoinRequest, submitJoinRequest } from '@/lib/household/join-rpc';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { createRequestClient } from '@/lib/supabase/request-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOIN_PATH = '/join';

const FIELDS = [
  'join_code',
  'person_first_name',
  'person_last_name',
  'person_document_type',
  'person_document_number',
  'client_event_id',
] as const;

/**
 * D22: asks to join a unit with its code. The server finds the barrio from the code; a request never grants access,
 * it waits for the holder's approval. Whatever is wrong with the code (malformed, unknown, rotated, throttled, from
 * another barrio) comes back as the same `codeUnavailable`, so this screen can't be used to probe for codes.
 */
export async function submitJoinRequestAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, FIELDS);
  if (!(await getRequestContext())) return formError('unknown', values);

  const parsed = joinRequestFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (!UUID.test(values.client_event_id ?? ''))
    return formError('unknown', values);

  const result = await submitJoinRequest(await createRequestClient(), {
    join_code: parsed.data.join_code,
    person_data: {
      person_first_name: parsed.data.person_first_name,
      person_last_name: parsed.data.person_last_name,
      ...(parsed.data.person_document_type && parsed.data.person_document_number
        ? {
            person_document_type: parsed.data.person_document_type,
            person_document_number: parsed.data.person_document_number,
          }
        : {}),
    },
    client_event_id: values.client_event_id ?? '',
  });
  if ('error' in result) {
    reportError(new Error(`Join request failed (${result.error})`), {
      operation: 'join.submit',
    });
    return formError('unknown', values);
  }
  if (result.status === 'unavailable')
    return fieldError({ join_code: 'codeUnavailable' }, values);
  revalidatePath(JOIN_PATH);
  return { status: 'success', notice: 'sent' };
}

/** Withdraws one of the caller's own pending requests. */
export async function cancelJoinRequestAction(
  requestId: string,
): Promise<PlatformFormState> {
  if (!UUID.test(requestId) || !(await getRequestContext()))
    return formError('cancelFailed');
  const { error } = await cancelJoinRequest(
    await createRequestClient(),
    requestId,
    crypto.randomUUID(),
  );
  if (error) {
    if (error !== '42501')
      reportError(new Error(`Join request cancel failed (${error})`), {
        operation: 'join.cancel',
      });
    return formError('cancelFailed');
  }
  revalidatePath(JOIN_PATH);
  return { status: 'success', notice: 'cancelled' };
}
