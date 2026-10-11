'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import type { PlatformFormState } from '@/lib/platform/form-state';

export type HouseholdAction = (
  previous: PlatformFormState,
  formData: FormData,
) => Promise<PlatformFormState>;

/** What the section shows after an action: the key of a confirmation or of an error. */
export type Notice = { tone: 'success' | 'error'; key: string };

/** The notice an action's answer stands for (`null` while nothing happened yet). */
export function noticeOf(state: PlatformFormState): Notice | null {
  if (state.status === 'success')
    return state.notice ? { tone: 'success', key: state.notice } : null;
  if (state.status === 'error')
    return {
      tone: 'error',
      key: state.formError ?? Object.values(state.errors)[0] ?? 'unknown',
    };
  return null;
}

/**
 * Runs a one-shot action (no form: a toggle, a confirmation) and keeps its outcome as the notice of the section.
 * Several of these can be in flight in different sections, so each keeps its own `pending`.
 */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice | null>(null);
  const run = (
    work: () => Promise<PlatformFormState>,
    after?: (result: PlatformFormState) => void,
  ) => {
    setNotice(null);
    startTransition(async () => {
      const result = await work();
      setNotice(noticeOf(result));
      after?.(result);
    });
  };
  return { run, pending, notice, setNotice };
}

/** Confirmation or error of the last action, with its icon (never color alone). */
export function ActionNotice({
  notice,
  className,
}: {
  notice: Notice | null;
  className?: string;
}) {
  const notices = useTranslations('household.notices');
  const errors = useTranslations('household.errors');
  if (!notice) return null;
  const text =
    notice.tone === 'success'
      ? notices.has(notice.key as 'saved')
        ? notices(notice.key as 'saved')
        : notices('saved')
      : errors.has(notice.key as 'unknown')
        ? errors(notice.key as 'unknown')
        : errors('unknown');
  return (
    <AuthNotice tone={notice.tone} className={className}>
      {text}
    </AuthNotice>
  );
}

/** Message of a field or form error key, always inside `household.errors`. */
export function useErrorMessage() {
  const errors = useTranslations('household.errors');
  return (key: string | undefined) =>
    key === undefined
      ? undefined
      : errors.has(key as 'unknown')
        ? errors(key as 'unknown')
        : errors('unknown');
}
