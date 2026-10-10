'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

export interface SubNavItem {
  href: string;
  label: string;
}

/**
 * Second-level navigation as a horizontally scrollable strip of links (small screens, where the sidebar is not
 * there). The current page carries `aria-current` and a heavier weight, not only a different fill.
 */
export function SubNav({
  items,
  label,
  className,
}: {
  items: readonly SubNavItem[];
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className={cn('-mx-4 overflow-x-auto px-4', className)}
    >
      <ul className="flex w-max gap-1 rounded-button bg-surface-2 p-1">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[calc(var(--control-height)-8px)] items-center rounded-button px-4 text-app-body-dense whitespace-nowrap',
                  active && 'bg-surface-0 font-semibold',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
