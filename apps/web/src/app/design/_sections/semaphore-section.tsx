import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { SemaphorePanel } from '@/components/ui/semaphore-panel';
import type { AccessDecision } from '@/components/ui/semaphore-panel';
import { Section } from './section';

const decisions: AccessDecision[] = ['green', 'yellow', 'red'];

export async function SemaphoreSection() {
  const t = await getTranslations('design.semaphore');
  return (
    <Section id="semaphore" title={t('title')} description={t('description')}>
      <ul className="grid gap-6 lg:grid-cols-2">
        {decisions.map((decision) => (
          <li key={decision} className="flex">
            <SemaphorePanel
              decision={decision}
              result={t(`${decision}.result`)}
              reason={t(`${decision}.reason`)}
              ruleName={t(`${decision}.rule`)}
              authorizedBy={t(`${decision}.authorizedBy`)}
              fill={false}
              live={false}
              className="w-full"
            >
              <Button
                size="panel"
                variant={decision === 'red' ? 'secondary' : 'primary'}
              >
                {t(`${decision}.action`)}
              </Button>
            </SemaphorePanel>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-app-caption text-text-secondary">
        {t('fillNote')}
      </p>
    </Section>
  );
}
