import { ChevronRight, LifeBuoy } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';

/** Settings of the barrio. Only the support-access log exists so far; the other settings arrive with their modules. */
export default async function SettingsPage() {
  const nav = await getTranslations('nav.items');
  const t = await getTranslations('settingsSupport');
  return (
    <>
      <PageHeader title={nav('settings')} />
      <Card density="dense" className="p-2">
        <ul>
          <li>
            <Link
              href="/settings/support"
              className="flex min-h-(--control-height) items-center gap-3 rounded-input px-3 py-2 text-app-body hover:bg-surface-2"
            >
              <LifeBuoy
                aria-hidden="true"
                className="size-5 shrink-0 text-text-secondary"
                strokeWidth={1.75}
              />
              <span className="min-w-0 flex-1">{t('title')}</span>
              <ChevronRight
                aria-hidden="true"
                className="size-5 shrink-0 text-text-secondary"
                strokeWidth={2}
              />
            </Link>
          </li>
        </ul>
      </Card>
    </>
  );
}
