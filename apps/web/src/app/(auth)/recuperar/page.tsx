import { getTranslations } from 'next-intl/server';
import { RecoverForm } from '@/components/auth/recover-form';

export async function generateMetadata() {
  const t = await getTranslations('auth.recover');
  return { title: t('metaTitle') };
}

export default async function RecoverPage() {
  const t = await getTranslations('auth.recover');
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-app-title">{t('title')}</h1>
        <p className="text-text-secondary">{t('description')}</p>
      </header>
      <RecoverForm />
    </div>
  );
}
