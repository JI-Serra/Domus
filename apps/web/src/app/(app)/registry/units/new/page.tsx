import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { UnitForm } from '@/components/registry/unit-form';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { requireAdminScope } from '@/lib/registry/guard';
import { saveUnitAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.units');
  return { title: t('createMetaTitle') };
}

export default async function NewUnitPage() {
  const scope = await requireAdminScope('registry');
  const t = await getTranslations('registry.units');
  return (
    <>
      <PageHeader
        title={t('createTitle')}
        action={
          <ButtonLink
            href="/registry/units"
            variant="secondary"
            icon={
              <ArrowLeft
                aria-hidden="true"
                className="size-5"
                strokeWidth={2}
              />
            }
          >
            {t('back')}
          </ButtonLink>
        }
      />
      <Card>
        {scope.writable ? (
          <UnitForm
            action={saveUnitAction.bind(null, null)}
            cancelHref="/registry/units"
          />
        ) : (
          <p>{t('readOnly')}</p>
        )}
      </Card>
    </>
  );
}
