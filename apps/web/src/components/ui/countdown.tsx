'use client';

import { formatCountdown, secondsUntil } from '@domus/domain/registry-ui';
import { useEffect, useState } from 'react';

/**
 * Seconds left until `expiresAt`, re-evaluated every second against the clock (so a sleeping tab corrects itself).
 * Starts from `initialNow` so the first client render matches the server's.
 */
export function useCountdown(expiresAt: string, initialNow?: Date): number {
  const [now, setNow] = useState(() => initialNow ?? new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return secondsUntil(expiresAt, now);
}

/** `m:ss` counting down to `expiresAt`; the label says what is expiring. Announced politely at the minute marks. */
export function Countdown({
  expiresAt,
  label,
  expiredLabel,
  initialNow,
}: {
  expiresAt: string;
  label: string;
  expiredLabel: string;
  initialNow?: Date;
}) {
  const seconds = useCountdown(expiresAt, initialNow);
  const text = seconds === 0 ? expiredLabel : formatCountdown(seconds);
  return (
    <span className="inline-flex items-center gap-2 text-app-body-dense">
      <span className="text-text-secondary">{label}</span>
      <time
        dateTime={`PT${seconds}S`}
        className="font-mono font-semibold tabular-nums"
        data-testid="countdown"
      >
        {text}
      </time>
      <span role="status" className="sr-only">
        {seconds === 0 || seconds % 60 === 0 ? text : ''}
      </span>
    </span>
  );
}
