import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { EMBLEM_PATH, EMBLEM_VIEW_BOX } from './brand-paths';

export interface BrandMarkProps extends Omit<
  ComponentProps<'svg'>,
  'children' | 'viewBox' | 'role'
> {
  /** Hides the mark from assistive technology when something next to it already says "Domus". */
  decorative?: boolean;
}

/**
 * The Domus emblem (the "D" with the open door). It paints with `currentColor`, so it follows the surrounding text
 * color in every theme; size it with a height class (the width follows the aspect ratio).
 */
export function Emblem({
  className,
  decorative = false,
  ...props
}: BrandMarkProps) {
  const t = useTranslations('common');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={EMBLEM_VIEW_BOX}
      fill="currentColor"
      fillRule="evenodd"
      className={cn('h-8 w-auto shrink-0', className)}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': t('appName') })}
      focusable="false"
      {...props}
    >
      <path d={EMBLEM_PATH} />
    </svg>
  );
}
