'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useActiveContext } from './active-context';
import { getNavigation, isNavItemActive } from './navigation';

/** Desktop navigation (≥ 1024 px): 240 px, `surface-1`, active item on `surface-2` with weight 600. */
export function Sidebar() {
  const t = useTranslations('nav');
  const brand = useTranslations('common');
  const pathname = usePathname();
  const { active } = useActiveContext();

  return (
    <aside className="hidden bg-surface-1 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-(--sidebar-width) lg:flex-col lg:gap-6 lg:px-3 lg:py-5">
      <p className="px-3 text-app-heading">{brand('appName')}</p>
      <nav aria-label={t('sidebarLabel')}>
        <ul className="flex flex-col gap-1">
          {getNavigation(active.membership_role).map((entry) => {
            const isActive = isNavItemActive(pathname, entry.href);
            const Icon = entry.icon;
            return (
              <li key={entry.id}>
                <Link
                  href={entry.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-(--control-height) items-center gap-3 rounded-input px-3 py-2 text-app-body-dense hover:bg-surface-2',
                    isActive && 'bg-surface-2 font-semibold',
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  {t(`items.${entry.id}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
