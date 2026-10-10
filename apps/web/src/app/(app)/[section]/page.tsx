import { Hammer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  getNavItemBySlug,
  getPlaceholderSlugs,
} from '@/components/shell/navigation';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamicParams = false;

export function generateStaticParams() {
  return getPlaceholderSlugs().map((section) => ({ section }));
}

/** Placeholder for every navigation destination whose module has not been built yet. */
export default async function SectionPlaceholderPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const entry = getNavItemBySlug(section);
  if (!entry) notFound();

  const nav = await getTranslations('nav');
  const t = await getTranslations('placeholder');
  return (
    <>
      <PageHeader title={nav(`items.${entry.id}`)} />
      <Card>
        <EmptyState
          icon={Hammer}
          title={t('title')}
          align="start"
          action={<ButtonLink href="/">{t('backHome')}</ButtonLink>}
        />
      </Card>
    </>
  );
}
