import { ShieldOff } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('support.blocked');
  return { title: t('metaTitle') };
}

/**
 * Where the proxy sends every area that is closed during a support session (security, invitations, sign-in, the
 * platform area). It replaces the page instead of leaving a dead control behind.
 */
export default async function SupportBlockedPage() {
  const t = await getTranslations('support.blocked');
  return (
    <>
      <PageHeader title={t('title')} />
      <Card>
        <EmptyState
          icon={ShieldOff}
          title={t('description')}
          align="start"
          action={<ButtonLink href="/">{t('backHome')}</ButtonLink>}
        />
      </Card>
    </>
  );
}
