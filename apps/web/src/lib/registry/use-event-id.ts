'use client';

import { useState } from 'react';
import type { PlatformFormState } from '@/lib/platform/form-state';

/**
 * Idempotency key (`client_event_id`) of one submission. Retrying the same submission reuses it (so a retry cannot
 * apply twice); once a submission succeeded the key is renewed, because the next one is a different operation.
 */
export function useEventId(state: PlatformFormState): string {
  const [eventId, setEventId] = useState(() => crypto.randomUUID());
  const [renewedFor, setRenewedFor] = useState<PlatformFormState | null>(null);
  if (state.status === 'success' && renewedFor !== state) {
    setRenewedFor(state);
    setEventId(crypto.randomUUID());
  }
  return eventId;
}
