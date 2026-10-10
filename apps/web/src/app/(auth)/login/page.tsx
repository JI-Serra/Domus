import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/login-form';
import { isAuthErrorKey } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/redirect';

export async function generateMetadata() {
  const t = await getTranslations('auth.login');
  return { title: t('metaTitle') };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.login');
  const params = await searchParams;
  const error = first(params.error);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-app-title">{t('title')}</h1>
      <LoginForm
        next={safeNextPath(first(params.next))}
        initialError={isAuthErrorKey(error) ? error : undefined}
      />
    </div>
  );
}
