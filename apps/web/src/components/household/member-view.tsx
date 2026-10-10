import { Hammer } from 'lucide-react';
import type { HouseholdPermission } from '@domus/domain/household';
import { householdPermissions } from '@domus/domain/registry';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import type { MemberView } from '@/lib/household/view';

/**
 * What the holder has enabled for a household member (D23): one card per delegated permission and nothing for the
 * rest. The modules behind them (finance, amenities, access passes) arrive in later milestones, so each card is a
 * placeholder for now; the database already withholds the data of a permission that is not granted.
 */
export function DelegatedSections({
  permissions,
}: {
  permissions: readonly HouseholdPermission[];
}) {
  const t = useTranslations('household');
  const enabled = householdPermissions.filter((permission) =>
    permissions.includes(permission),
  );
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <h2 className="text-app-heading">{t('sections.delegated')}</h2>
      {enabled.length === 0 ? (
        <p className="text-text-secondary">{t('delegated.empty')}</p>
      ) : (
        <ul
          aria-label={t('sections.delegated')}
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {enabled.map((permission) => (
            <li
              key={permission}
              data-permission={permission}
              className="flex items-center gap-3 rounded-card-dense bg-surface-0 p-4"
            >
              <Hammer
                aria-hidden="true"
                className="size-5 shrink-0 text-text-secondary"
                strokeWidth={1.75}
              />
              <div className="flex min-w-0 flex-col">
                <span className="text-app-subheading">
                  {t(`delegated.${permission}`)}
                </span>
                <span className="text-app-caption text-text-secondary">
                  {t('delegated.soon')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The viewer's own profile, read-only: nobody edits themself through the household screens. */
export function OwnData({ member }: { member: MemberView }) {
  const t = useTranslations('household');
  const rows: [string, string | null][] = [
    [t('fields.firstName'), member.firstName],
    [t('fields.lastName'), member.lastName],
    [t('fields.email'), member.email],
    [t('fields.phone'), member.phone],
    [t('fields.relationship'), t(`relationship.${member.relationship}`)],
  ];
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <h2 className="text-app-heading">{t('sections.yourData')}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col">
              <dt className="text-app-caption text-text-secondary">{label}</dt>
              <dd className="truncate text-app-subheading">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}
