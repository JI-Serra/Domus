import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/** Frame for the public authentication pages: brand and one centered card, single column from 360 px up. */
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('common');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-app-heading">{t('appName')}</p>
      <Card>{children}</Card>
    </main>
  );
}
