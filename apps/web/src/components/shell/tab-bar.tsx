'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useActiveContext } from './active-context';
import { getTabBarItems, isNavItemActive } from './navigation';

/** Mobile navigation (< 1024 px): icon + label, 49 px plus the device safe area. */
export function TabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { active } = useActiveContext();

  return (
    <nav
      aria-label={t('tabBarLabel')}
      className="fixed inset-x-0 bottom-0 z-30 bg-surface-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl">
        {getTabBarItems(active.membership_role).map((entry) => {
          const isActive = isNavItemActive(pathname, entry.href);
          const Icon = entry.icon;
          return (
            <li key={entry.id} className="min-w-0 flex-1">
              <Link
                href={entry.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-[max(var(--tab-bar-height),var(--control-height))] flex-col items-center justify-center gap-0.5 px-1 py-1 text-app-micro',
                  isActive
                    ? 'font-semibold text-text-primary'
                    : 'text-text-secondary',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-14 items-center justify-center rounded-badge',
                    isActive && 'bg-surface-2',
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                </span>
                <span className="max-w-full truncate">
                  {t(`tabs.${entry.id}`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
