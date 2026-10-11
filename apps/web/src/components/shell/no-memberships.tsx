import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LogoutButton } from './logout-button';

/** Shown to a signed-in user who has no active membership: nothing to act as, so only the way out. */
export function NoMemberships() {
  const t = useTranslations('context.empty');
  const brand = useTranslations('common');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <p className="text-app-heading">{brand('appName')}</p>
      <EmptyState
        icon={Building2}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/join">{t('joinAction')}</ButtonLink>
            <LogoutButton />
          </div>
        }
      />
    </main>
  );
}
