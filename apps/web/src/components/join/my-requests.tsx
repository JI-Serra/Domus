'use client';

import { formatDate } from '@domus/domain/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cancelJoinRequestAction } from '@/app/(account)/join/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { useActionRunner } from '@/components/household/notice';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { MyJoinRequest } from '@/lib/household/join-rpc';

function RequestRow({ request }: { request: MyJoinRequest }) {
  const t = useTranslations('join.requests');
  const errors = useTranslations('join.errors');
  const [confirming, setConfirming] = useState(false);
  const { run, pending, notice } = useActionRunner();
  const unit = `${request.tenant_name} · ${request.unit_code}`;
  const status = request.unit_join_request_status;

  return (
    <li className="flex flex-col gap-3 rounded-card-dense bg-surface-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-app-subheading">{unit}</span>
          <span className="text-app-caption text-text-secondary">
            {t('sentAt', {
              date: formatDate(request.unit_join_request_created_at),
            })}
          </span>
        </div>
        {status === 'pending' ? (
          <StatusBadge status="warning">{t('statuses.pending')}</StatusBadge>
        ) : status === 'approved' ? (
          <StatusBadge status="success">{t('statuses.approved')}</StatusBadge>
        ) : (
          <Badge>{t(`statuses.${status}`)}</Badge>
        )}
      </div>
      {status === 'approved' ? (
        <p className="text-app-caption text-text-secondary">
          {t('approvedHint')}
        </p>
      ) : null}
      {notice?.tone === 'error' ? (
        <AuthNotice tone="error">{errors('cancelFailed')}</AuthNotice>
      ) : null}
      {status === 'pending' ? (
        <div>
          <Button
            variant="secondary"
            aria-label={t('cancelLabel', { unit })}
            onClick={() => setConfirming(true)}
          >
            {t('cancel')}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title={t('cancelTitle')}
        confirmLabel={pending ? t('cancelling') : t('cancelConfirm')}
        cancelLabel={t('keep')}
        tone="destructive"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => cancelJoinRequestAction(request.unit_join_request_id),
            () => setConfirming(false),
          )
        }
      >
        {t('cancelBody')}
      </ConfirmDialog>
    </li>
  );
}

/** The caller's own join requests with their status; a pending one can be cancelled. */
export function MyJoinRequests({
  requests,
}: {
  requests: readonly MyJoinRequest[];
}) {
  const t = useTranslations('join.requests');
  if (requests.length === 0) return null;
  return (
    <Card density="dense" className="flex flex-col gap-4">
      <h2 className="text-app-heading">{t('title')}</h2>
      <ul aria-label={t('listLabel')} className="flex flex-col gap-3">
        {requests.map((request) => (
          <RequestRow key={request.unit_join_request_id} request={request} />
        ))}
      </ul>
    </Card>
  );
}
