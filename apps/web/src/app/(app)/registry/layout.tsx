import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  filterByPermissions,
  getRegistryNavigation,
} from '@/components/shell/navigation';
import { SubNav } from '@/components/ui/sub-nav';
import { getAdminPermissions } from '@/lib/registry/permissions';

/**
 * Padrón area: only for administrators with `registry` or `guards` (everybody else gets the same 404 as for any
 * unknown page). Below 1024 px the sidebar's second-level entries become a strip of links on top of every page.
 */
export default async function RegistryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const permissions = await getAdminPermissions();
  const [section] = filterByPermissions([getRegistryNavigation()], permissions);
  if (!section) notFound();
  const t = await getTranslations('nav');
  const items = (section.children ?? []).map((entry) => ({
    href: entry.href,
    label: t(`items.${entry.id}`),
  }));
  return (
    <>
      <SubNav
        items={items}
        label={t('items.registry')}
        className="mb-4 lg:hidden"
      />
      {children}
    </>
  );
}
