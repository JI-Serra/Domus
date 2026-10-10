import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { LOGO_PATH, LOGO_VIEW_BOX } from './brand-paths';
import type { BrandMarkProps } from './emblem';

/**
 * The Domus wordmark: the emblem followed by "omus" (so the "D" is the emblem). Paints with `currentColor`; size it
 * with a height class.
 */
export function Logo({
  className,
  decorative = false,
  ...props
}: BrandMarkProps) {
  const t = useTranslations('common');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={LOGO_VIEW_BOX}
      fill="currentColor"
      fillRule="evenodd"
      className={cn('h-7 w-auto shrink-0', className)}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': t('appName') })}
      focusable="false"
      {...props}
    >
      <path d={LOGO_PATH} />
    </svg>
  );
}
