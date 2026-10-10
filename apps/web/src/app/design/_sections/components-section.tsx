import { Inbox, Plus, Trash2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge, StatusBadge } from '@/components/ui/badge';
import type { StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { Section, Specimen } from './section';

const statuses: StatusTone[] = [
  'success',
  'warning',
  'danger',
  'info',
  'offline',
];

export async function ButtonsSection() {
  const t = await getTranslations('design.buttons');
  return (
    <Section id="buttons" title={t('title')} info={t('info')}>
      <div className="grid gap-8 lg:grid-cols-2">
        <Specimen title={t('variantsTitle')}>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              icon={<Plus aria-hidden="true" className="size-5" />}
            >
              {t('primary')}
            </Button>
            <Button variant="secondary">{t('secondary')}</Button>
            <Button variant="ghost">{t('ghost')}</Button>
            <Button
              variant="destructive"
              icon={<Trash2 aria-hidden="true" className="size-5" />}
            >
              {t('destructive')}
            </Button>
          </div>
        </Specimen>

        <Specimen title={t('statesTitle')}>
          <div className="flex flex-wrap gap-3">
            <Button disabled>{t('disabled')}</Button>
            <Button variant="secondary" disabled>
              {t('disabled')}
            </Button>
          </div>
        </Specimen>

        <Specimen title={t('sizesTitle')}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="md">{t('sizeMd')}</Button>
            <Button size="gate">{t('sizeGate')}</Button>
            <Button size="icon" variant="secondary" aria-label={t('iconLabel')}>
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </Specimen>

        <Specimen title={t('panelTitle')}>
          <Button size="panel">{t('panelAction')}</Button>
        </Specimen>
      </div>
    </Section>
  );
}

export async function InputsSection() {
  const t = await getTranslations('design.inputs');
  return (
    <Section id="inputs" title={t('title')} info={t('info')}>
      <div className="grid gap-6 md:grid-cols-2">
        <Field
          label={t('defaultLabel')}
          info={{ label: t('infoLabel'), text: t('infoText') }}
        >
          <Input placeholder={t('placeholder')} autoComplete="off" />
        </Field>
        <Field label={t('errorLabel')} error={t('errorMessage')}>
          <Input defaultValue={t('errorValue')} autoComplete="off" />
        </Field>
        <Field label={t('selectLabel')}>
          <Select defaultValue="visit">
            <option value="visit">{t('optionVisit')}</option>
            <option value="delivery">{t('optionDelivery')}</option>
            <option value="service">{t('optionService')}</option>
          </Select>
        </Field>
        <Field label={t('disabledLabel')}>
          <Input disabled defaultValue={t('disabledValue')} />
        </Field>
      </div>
    </Section>
  );
}

export async function BadgesSection() {
  const t = await getTranslations('design.badges');
  return (
    <Section id="badges" title={t('title')} info={t('info')}>
      <div className="flex flex-col gap-6">
        <Specimen title={t('statusTitle')}>
          <ul className="flex flex-wrap gap-3">
            {statuses.map((status) => (
              <li key={status}>
                <StatusBadge status={status}>
                  {t(`status.${status}`)}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Specimen>
        <Specimen title={t('informativeTitle')}>
          <ul className="flex flex-wrap gap-3">
            <li>
              <Badge tone="neutral">{t('neutral')}</Badge>
            </li>
            <li>
              <Badge tone="ember">{t('new')}</Badge>
            </li>
            <li>
              <Badge tone="ember">{t('pending')}</Badge>
            </li>
          </ul>
        </Specimen>
      </div>
    </Section>
  );
}

export async function CardsSection() {
  const t = await getTranslations('design.cards');
  const empty = await getTranslations('design.emptyState');
  return (
    <Section id="cards" title={t('title')} info={t('info')}>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h3 className="text-app-heading">{t('comfortableTitle')}</h3>
        </Card>
        <Card density="dense">
          <h3 className="text-app-subheading">{t('denseTitle')}</h3>
        </Card>
      </div>
      <Card className="mt-6">
        <EmptyState
          icon={Inbox}
          title={empty('title')}
          description={empty('description')}
          action={<Button>{empty('action')}</Button>}
        />
      </Card>
    </Section>
  );
}
