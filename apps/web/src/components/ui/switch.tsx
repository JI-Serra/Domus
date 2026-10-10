'use client';

import { useId } from 'react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'role' | 'children'
> {
  label: string;
  description?: string;
}

/** Native checkbox with switch semantics. The on state is shown by the knob position and the filled track. */
export function Switch({
  label,
  description,
  className,
  ...props
}: SwitchProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div
      className={cn(
        'flex min-h-(--control-height) items-center gap-3',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={description ? descriptionId : undefined}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-2 transition-colors duration-(--duration-ui) peer-checked:bg-accent peer-focus-visible:outline-(length:--ring-width) peer-focus-visible:outline-accent peer-focus-visible:outline-solid peer-focus-visible:outline-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-surface-0 after:ring-1 after:ring-hairline after:transition-transform after:duration-(--duration-ui) after:content-[''] peer-checked:after:translate-x-5"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <label htmlFor={id} className="cursor-pointer text-app-subheading">
          {label}
        </label>
        {description ? (
          <span
            id={descriptionId}
            className="text-app-caption text-text-secondary"
          >
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
