'use client';

import { formatDate } from '@domus/domain/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { decideJoinRequestAction } from '@/app/(app)/home/actions';
import { useTenantWritable } from '@/components/tenant/tenant-status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoButton } from '@/components/ui/info-button';
import type { JoinRequestView } from '@/lib/household/view';
import { ActionNotice, noticeOf, useActionRunner } from './notice';
import type { Notice } from './notice';

function RequestRow({
  request,
  onNotice,
}: {
  request: JoinRequestView;
  onNotice: (notice: Notice | null) => void;
}) {
  const t = useTranslations('household.requests');
  const writable = useTenantWritable();
  const { run, pending } = useActionRunner();
  // One key per decision: a retry after a lost answer decides (and invites) only once.
  const [eventId] = useState(() => crypto.randomUUID());
  const name = `${request.firstName} ${request.lastName}`.trim();
  const decide = (approve: boolean) =>
    run(
      () => decideJoinRequestAction(request.requestId, approve, eventId),
      (result) => onNotice(noticeOf(result)),
    );

  return (
    <li className="flex flex-col gap-3 rounded-card-dense bg-surface-0 p-4">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-app-subheading">{name}</span>
        <span className="truncate text-app-caption text-text-secondary">
          {[
            request.email,
            t('sentAt', { date: formatDate(request.createdAt) }),
          ].join(' · ')}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!writable || pending}
          aria-label={t('approveLabel', { name })}
          onClick={() => decide(true)}
        >
          {pending ? t('working') : t('approve')}
        </Button>
        <Button
          variant="secondary"
          disabled={!writable || pending}
          aria-label={t('rejectLabel', { name })}
          onClick={() => decide(false)}
        >
          {t('reject')}
        </Button>
      </div>
    </li>
  );
}

/** Requests to join the unit with its code (D22). Nothing is granted until the holder approves and the requester accepts. */
export function JoinRequestSection({
  requests,
}: {
  requests: readonly JoinRequestView[];
}) {
  const t = useTranslations('household');
  const [notice, setNotice] = useState<Notice | null>(null);

  // Once everything is decided the list disappears; the outcome stays visible until the next action.
  if (requests.length === 0 && !notice) return null;
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <h2 className="text-app-heading">{t('sections.requests')}</h2>
        <InfoButton label={t('requests.infoLabel')}>
          {t('requests.info')}
        </InfoButton>
      </div>
      <ActionNotice notice={notice} />
      {requests.length > 0 ? (
        <ul
          aria-label={t('requests.listLabel')}
          className="grid gap-3 md:grid-cols-2"
        >
          {requests.map((request) => (
            <RequestRow
              key={request.requestId}
              request={request}
              onNotice={setNotice}
            />
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
