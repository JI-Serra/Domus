import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { UnitForm } from '@/components/registry/unit-form';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { loadUnitSheet } from '@/lib/registry/data';
import { UUID_PATTERN, requireAdminScope } from '@/lib/registry/guard';
import { saveUnitAction } from '../../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.units');
  return { title: t('editMetaTitle') };
}

export default async function EditUnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  if (!UUID_PATTERN.test(unitId)) notFound();
  const scope = await requireAdminScope('registry');
  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  if (!sheet || sheet.unit.unit_archived_at) notFound();
  const t = await getTranslations('registry.units');
  return (
    <>
      <PageHeader
        title={t('editTitle', { unit: sheet.unit.unit_code })}
        action={
          <ButtonLink
            href={`/registry/units/${unitId}`}
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
            action={saveUnitAction.bind(null, unitId)}
            unit={sheet.unit}
            cancelHref={`/registry/units/${unitId}`}
          />
        ) : (
          <p>{t('readOnly')}</p>
        )}
      </Card>
    </>
  );
}
