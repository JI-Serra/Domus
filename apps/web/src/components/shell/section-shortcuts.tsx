'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useActiveContext } from './active-context';
import { getNavigation } from './navigation';

/** Links to the sections the active role can open, so the home page has somewhere to go besides the menu. */
export function SectionShortcuts() {
  const t = useTranslations('home');
  const nav = useTranslations('nav');
  const { active } = useActiveContext();
  const entries = getNavigation(active.membership_role).filter(
    (entry) => entry.id !== 'home',
  );

  return (
    <Card>
      <h2 className="mb-4 text-app-heading">{t('sectionsTitle')}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <li key={entry.id}>
              <Link
                href={entry.href}
                className="flex min-h-(--control-height) items-center gap-3 rounded-input bg-surface-0 px-4 py-2 text-app-body-dense hover:bg-surface-2"
              >
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0"
                  strokeWidth={1.75}
                />
                {nav(`items.${entry.id}`)}
              </Link>
            </li>
          );
        })}
      </ul>
      {active.membership_role === 'unit_holder' ||
      active.membership_role === 'household_member' ? (
        <ButtonLink href="/join" variant="secondary" className="mt-4">
          {t('joinLink')}
        </ButtonLink>
      ) : null}
    </Card>
  );
}
