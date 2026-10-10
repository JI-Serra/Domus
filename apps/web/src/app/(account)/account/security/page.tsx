import { isMfaRecommended } from '@domus/domain/auth';
import { getTranslations } from 'next-intl/server';
import { AuthNotice } from '@/components/auth/auth-notice';
import { FactorList } from '@/components/account/factor-list';
import { MfaRecommendation } from '@/components/account/mfa-recommendation';
import { TotpEnrollment } from '@/components/account/totp-enrollment';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { InfoButton } from '@/components/ui/info-button';
import { loadVerifiedFactors } from '@/lib/auth/mfa';
import { safeNextPath } from '@/lib/auth/redirect';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

export async function generateMetadata() {
  const t = await getTranslations('account.security');
  return { title: t('metaTitle') };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Two-step verification of the account (M01-F05): enroll an authenticator app, list and remove factors. Platform
 * admins land here without a factor when they try to open `/platform`, and continue there after enrolling; tenant
 * admins see a dismissible recommendation (and only here).
 */
export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('account.security');
  const next = safeNextPath(first((await searchParams).next), '');
  const request = await getRequestContext();
  const factors = await loadVerifiedFactors(await createRequestClient());

  const roles = request?.resolved.options.map((o) => o.membership_role) ?? [];
  const mustEnrollForPlatform =
    request?.resolved.platformMfaStep === 'enroll' &&
    factors.length === 0 &&
    next.startsWith('/platform');
  const recommend = isMfaRecommended(roles) && factors.length === 0;

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="flex flex-col gap-6">
        {mustEnrollForPlatform ? (
          <AuthNotice tone="info">{t('requiredForPlatform')}</AuthNotice>
        ) : null}
        {recommend && !mustEnrollForPlatform ? <MfaRecommendation /> : null}
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
          <Card>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <h2 className="text-app-heading">{t('mfa.title')}</h2>
              <InfoButton label={t('mfa.infoLabel')}>
                {t('mfa.info')}
              </InfoButton>
              <Badge tone={factors.length > 0 ? 'success' : 'neutral'}>
                {factors.length > 0 ? t('mfa.statusOn') : t('mfa.statusOff')}
              </Badge>
            </div>
            <TotpEnrollment hasFactor={factors.length > 0} next={next} />
          </Card>
          <Card>
            <h2 className="mb-5 text-app-heading">{t('factors.title')}</h2>
            <FactorList factors={factors} />
          </Card>
        </div>
      </div>
    </>
  );
}
