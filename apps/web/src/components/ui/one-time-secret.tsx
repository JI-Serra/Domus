'use client';

import type { ReactNode } from 'react';
import { CopyTextButton } from './copy-text-button';
import { InfoButton } from './info-button';

export interface OneTimeSecretProps {
  /** What the value is ("Código de la unidad"). */
  label: string;
  /** The secret, shown exactly as it should be typed (already grouped by the caller). */
  value: string;
  copyLabel: string;
  copiedLabel: string;
  /** Accessible name and text of the "i" popover that says it is shown only once. */
  info: { label: string; text: ReactNode };
  /** Extra content next to the copy button (a countdown, a close action). */
  children?: ReactNode;
}

/**
 * A secret the server hands out a single time (unit join code, device pairing code, one-time link). It is shown in
 * large type with a copy button, never stored by the page, and the "only once" warning lives behind an info button
 * instead of as permanent text.
 */
export function OneTimeSecret({
  label,
  value,
  copyLabel,
  copiedLabel,
  info,
  children,
}: OneTimeSecretProps) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-3 rounded-card-dense bg-surface-2 p-4"
    >
      <div className="flex items-center gap-1">
        <h3 className="text-app-subheading">{label}</h3>
        <InfoButton label={info.label}>{info.text}</InfoButton>
      </div>
      <p
        data-testid="one-time-secret"
        className="font-mono text-2xl tracking-widest break-all select-all"
      >
        {value}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CopyTextButton
          text={value}
          label={copyLabel}
          copiedLabel={copiedLabel}
          variant="primary"
        />
        {children}
      </div>
    </section>
  );
}
