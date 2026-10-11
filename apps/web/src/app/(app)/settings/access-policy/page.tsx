import { History } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PolicyEditor } from '@/components/access-policy/policy-editor';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { InfoButton } from '@/components/ui/info-button';
import { loadAccessPolicy } from '@/lib/access-policy/data';
import { requirePolicyScope } from '@/lib/access-policy/scope';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('accessPolicy');
  return { title: t('metaTitle') };
}

/**
 * M03-F01–F05: the access policy of the barrio. Administrators with `access_config` edit it (while the barrio accepts
 * writes); every other administrator sees it read-only, which is what the database allows any member to read.
 */
export default async function AccessPolicyPage() {
  const scope = await requirePolicyScope();
  const [{ policy, metadata }, t] = await Promise.all([
    loadAccessPolicy(scope.client, scope.tenantId),
    getTranslations('accessPolicy'),
  ]);
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            {t('title')}
            <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
          </span>
        }
        action={
          scope.canConfigure ? (
            <ButtonLink
              href="/settings/access-policy/history"
              variant="secondary"
              icon={<History aria-hidden="true" className="size-5" />}
            >
              {t('history')}
            </ButtonLink>
          ) : null
        }
      />
      <PolicyEditor
        policy={policy}
        appliedTemplate={
          metadata ? metadata.access_policy_applied_template : undefined
        }
        version={metadata?.access_policy_updated_at ?? ''}
        canEdit={scope.canEdit}
      />
    </>
  );
}
