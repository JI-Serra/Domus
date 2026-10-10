'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'role' | 'children'
> {
  label: string;
}

/**
 * Native checkbox with switch semantics. The whole control is one `<label>`, so clicking the track or the text
 * toggles it. The on state is shown by the knob position and the filled track.
 */
export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        'flex min-h-(--control-height) cursor-pointer items-center gap-3',
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 transition-colors duration-(--duration-ui) peer-checked:bg-accent peer-focus-visible:outline-(length:--ring-width) peer-focus-visible:outline-accent peer-focus-visible:outline-solid peer-focus-visible:outline-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-surface-0 after:ring-1 after:ring-hairline after:transition-transform after:duration-(--duration-ui) after:content-[''] peer-checked:after:translate-x-5"
      />
      <span className="min-w-0 flex-1 text-app-subheading">{label}</span>
    </label>
  );
}
