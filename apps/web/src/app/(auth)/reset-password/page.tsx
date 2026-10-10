import { getTranslations } from 'next-intl/server';
import { ResetForm } from '@/components/auth/reset-form';
import { AuthNotice } from '@/components/auth/auth-notice';
import { ButtonLink } from '@/components/ui/button';
import { getRequestIdentity } from '@/lib/context/request-context';

export async function generateMetadata() {
  const t = await getTranslations('auth.reset');
  return { title: t('metaTitle') };
}

/** Needs the recovery session that `/auth/callback` opens from the email link; without it the link has expired. */
export default async function ResetPasswordPage() {
  const t = await getTranslations('auth.reset');
  const identity = await getRequestIdentity();

  if (!identity) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-app-title">{t('title')}</h1>
        <AuthNotice tone="error" title={t('noSessionTitle')}>
          {t('noSessionBody')}
        </AuthNotice>
        <ButtonLink href="/forgot-password">{t('requestNew')}</ButtonLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-app-title">{t('title')}</h1>
      <ResetForm />
    </div>
  );
}
