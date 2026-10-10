import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MfaChallengeForm } from '@/components/auth/mfa-challenge-form';
import { LogoutButton } from '@/components/shell/logout-button';
import { loadVerifiedFactors } from '@/lib/auth/mfa';
import { safeNextPath } from '@/lib/auth/redirect';
import { getRequestIdentity } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

export async function generateMetadata() {
  const t = await getTranslations('auth.mfa');
  return { title: t('metaTitle') };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Second factor after the password or the magic link (M01-F05). Needs a session (`proxy.ts` sends visitors to
 * `/login`); a session that is already `aal2`, or whose user has no verified factor, has nothing to answer here.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('auth.mfa');
  const next = safeNextPath(first((await searchParams).next));

  const identity = await getRequestIdentity();
  if (!identity) redirect('/login');
  if (identity.aal === 'aal2') redirect(next);
  const factors = await loadVerifiedFactors(await createRequestClient());
  if (factors.length === 0) redirect(next);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-app-title">{t('title')}</h1>
      <MfaChallengeForm factors={factors} next={next} />
      <div className="flex justify-center">
        <LogoutButton />
      </div>
    </div>
  );
}
