'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Emblem } from '@/components/brand/emblem';
import { useSupportSession } from '@/components/support/support-session';
import { buttonStyles } from '@/components/ui/button';
import { MFA_SETTINGS_PATH } from '@/lib/auth/mfa';
import { AppearanceMenu } from './appearance-menu';
import { ContextSelector } from './context-selector';
import { GlobalSearch } from './global-search';
import { LogoutButton } from './logout-button';

/** Sticky top bar: the active context is always visible and switchable here, on every viewport. */
export function TopBar() {
  const t = useTranslations('account');
  // Acting as somebody else: no way into the account's security and no sign-out (the banner's "Terminar" is the exit).
  const supporting = useSupportSession() !== null;
  return (
    <header className="sticky top-0 z-30 flex min-h-(--top-bar-height) flex-wrap items-center gap-2 bg-surface-1 px-4 py-2 lg:flex-nowrap lg:px-6">
      {/* The sidebar carries the logo from 1024 px; below that the emblem stands in for it. */}
      <Link
        href="/"
        className="-mx-1 inline-flex min-h-(--control-height) items-center px-1 lg:hidden"
      >
        <Emblem className="h-7" />
      </Link>
      <ContextSelector className="flex-1" />
      {/* Admins with the registry permission: one row of their own below the bar on small screens. */}
      <GlobalSearch className="order-last w-full lg:order-none lg:w-96 lg:flex-none" />
      <AppearanceMenu />
      {supporting ? null : (
        <>
          <Link
            href={MFA_SETTINGS_PATH}
            aria-label={t('securityLink')}
            className={buttonStyles({ variant: 'secondary', size: 'icon' })}
          >
            <ShieldCheck
              aria-hidden="true"
              className="size-5"
              strokeWidth={2}
            />
          </Link>
          <LogoutButton compact />
        </>
      )}
    </header>
  );
}
