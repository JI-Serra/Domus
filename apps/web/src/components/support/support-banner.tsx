'use client';

import {
  formatCountdown,
  supportRemainingSeconds,
} from '@domus/domain/platform';
import { LifeBuoy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';
import { endSupportAction } from '@/lib/support/actions';
import { cn } from '@/lib/cn';
import { useSupportSession } from './support-session';

/**
 * Persistent banner of an active support session (M01-F04, D18): who the admin is acting as and how long is left,
 * with the way out. It inverts the page colors (always the highest contrast available, in light and dark) and wraps
 * on narrow screens, so it cannot be missed at 360 px. When the countdown reaches zero it ends the session itself.
 */
export function SupportBanner() {
  const support = useSupportSession();
  const t = useTranslations('support.banner');
  const [now, setNow] = useState(() =>
    support ? new Date(support.serverNow) : new Date(0),
  );
  const [pending, startTransition] = useTransition();
  const ended = useRef(false);

  const sessionId = support?.sessionId;
  const expiresAt = support?.expiresAt;
  const remaining = expiresAt ? supportRemainingSeconds(expiresAt, now) : 0;

  const end = () => {
    if (!sessionId || ended.current) return;
    ended.current = true;
    startTransition(async () => {
      await endSupportAction(sessionId);
    });
  };

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // Auto-exit: the cookie and the token expire on their own, this just takes the admin back without a dead page.
  useEffect(() => {
    if (support && remaining === 0) end();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `end` only reads refs and the session id
  }, [remaining, sessionId]);

  if (!support) return null;

  const name = support.targetName || t('someone');
  return (
    <section
      aria-label={t('label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-text-primary px-4 py-2 text-surface-0 lg:px-6"
    >
      <LifeBuoy
        aria-hidden="true"
        className="size-6 shrink-0"
        strokeWidth={2}
      />
      <p className="min-w-0 flex-1 basis-56 text-app-body-dense font-semibold">
        {t('message', { name })}
        {support.tenantName ? (
          <span className="block text-app-caption font-normal">
            {support.tenantName}
          </span>
        ) : null}
      </p>
      <p
        role="timer"
        aria-label={t('timerLabel')}
        className={cn(
          'text-app-subheading tabular-nums',
          remaining <= 60 && 'underline decoration-2 underline-offset-4',
        )}
      >
        {t('remaining', { time: formatCountdown(remaining) })}
      </p>
      <button
        type="button"
        onClick={end}
        disabled={pending}
        className="inline-flex min-h-(--control-height) cursor-pointer items-center justify-center rounded-button bg-surface-0 px-5 py-2 text-app-body font-semibold whitespace-nowrap text-text-primary hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t('ending') : t('end')}
      </button>
    </section>
  );
}
