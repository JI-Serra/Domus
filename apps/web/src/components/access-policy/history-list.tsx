'use client';

import { formatDateTime } from '@domus/domain/format';
import { History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { PolicyHistoryItem } from '@/lib/access-policy/data';
import { ChangeList } from './change-list';

/** M03-F06: who changed the policy, when, whether by template or by hand, and what each field was before and after. */
export function HistoryList({
  items,
  names,
  timeZone,
}: {
  items: readonly PolicyHistoryItem[];
  /** Display name per user id, for the people the viewer may read. */
  names: Readonly<Record<string, string>>;
  timeZone: string;
}) {
  const t = useTranslations('accessPolicy');

  if (items.length === 0)
    return (
      <Card density="dense">
        <EmptyState
          icon={History}
          title={t('historyPage.empty')}
          align="start"
        />
      </Card>
    );

  const actorLabel = (item: PolicyHistoryItem) => {
    const actor = item.actorUserId ? names[item.actorUserId] : undefined;
    const base = item.isSupport
      ? t('historyPage.support')
      : (actor ?? t('historyPage.adminActor'));
    const onBehalf = item.onBehalfOfUserId
      ? names[item.onBehalfOfUserId]
      : undefined;
    return onBehalf
      ? `${base} ${t('historyPage.onBehalf', { name: onBehalf })}`
      : base;
  };

  return (
    <ul aria-label={t('historyPage.listLabel')} className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.eventId}>
          <Card density="dense" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-app-subheading">
                {formatDateTime(item.occurredAt, timeZone)}
              </span>
              <Badge tone={item.appliedTemplate ? 'info' : 'neutral'}>
                {item.appliedTemplate
                  ? t('historyPage.template', {
                      name: t(`templates.names.${item.appliedTemplate}`),
                    })
                  : t('historyPage.manual')}
              </Badge>
              <span className="text-app-body-dense text-text-secondary">
                {actorLabel(item)}
              </span>
            </div>
            {item.changes.length > 0 ? (
              <ChangeList
                changes={item.changes}
                label={t('historyPage.changesLabel')}
              />
            ) : (
              <p className="text-app-body-dense text-text-secondary">
                {t('historyPage.noValueChanges')}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
