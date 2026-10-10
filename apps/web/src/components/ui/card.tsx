import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends ComponentProps<'div'> {
  /** `comfortable`: 28 px radius for mobile and featured cards. `dense`: 16 px radius for admin tables and lists. */
  density?: 'comfortable' | 'dense';
  /** `subtle` sits on a `surface-0` page; `base` sits on a `surface-1` band. */
  tone?: 'subtle' | 'base';
}

/** Flat card: no shadow and no border (DESIGN.md §A.6). */
export function Card({
  density = 'comfortable',
  tone = 'subtle',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        density === 'comfortable'
          ? 'rounded-card p-5 sm:p-7'
          : 'rounded-card-dense p-4',
        tone === 'subtle' ? 'bg-surface-1' : 'bg-surface-0',
        className,
      )}
      {...props}
    />
  );
}
