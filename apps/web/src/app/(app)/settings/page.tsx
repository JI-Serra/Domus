import { ChevronRight, LifeBuoy, ScrollText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { getAdminPermissions } from '@/lib/registry/permissions';

function SettingsLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-(--control-height) items-center gap-3 rounded-input px-3 py-2 text-app-body hover:bg-surface-2"
      >
        <Icon
          aria-hidden="true"
          className="size-5 shrink-0 text-text-secondary"
          strokeWidth={1.75}
        />
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-text-secondary"
          strokeWidth={2}
        />
      </Link>
    </li>
  );
}

/**
 * Settings of the barrio: the access policy (administrators with `access_config`, M03) and the support-access log.
 * The other settings arrive with their modules.
 */
export default async function SettingsPage() {
  const nav = await getTranslations('nav.items');
  const support = await getTranslations('settingsSupport');
  const policy = await getTranslations('accessPolicy');
  const permissions = await getAdminPermissions();
  return (
    <>
      <PageHeader title={nav('settings')} />
      <Card density="dense" className="p-2">
        <ul>
          {permissions.includes('access_config') ? (
            <SettingsLink
              href="/settings/access-policy"
              icon={ScrollText}
              label={policy('title')}
            />
          ) : null}
          <SettingsLink
            href="/settings/support"
            icon={LifeBuoy}
            label={support('title')}
          />
        </ul>
      </Card>
    </>
  );
}
