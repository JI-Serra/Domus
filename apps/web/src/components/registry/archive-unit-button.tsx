'use client';

import { Archive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { archiveUnitAction } from '@/app/(app)/registry/units/actions';
import { useRunAction } from '@/lib/registry/use-run-action';
import { useErrorMessage } from './use-error-message';

/** Soft-archives the unit after a confirmation that states what stops working. */
export function ArchiveUnitButton({
  unitId,
  unitCode,
}: {
  unitId: string;
  unitCode: string;
}) {
  const t = useTranslations('registry.units.archive');
  const message = useErrorMessage();
  const [open, setOpen] = useState(false);
  const action = useRunAction();
  return (
    <>
      <Button
        variant="secondary"
        icon={<Archive aria-hidden="true" className="size-5" strokeWidth={2} />}
        onClick={() => setOpen(true)}
      >
        {t('action')}
      </Button>
      {action.error ? (
        <AuthNotice tone="error" className="basis-full">
          {message(action.error)}
        </AuthNotice>
      ) : null}
      <ConfirmDialog
        open={open}
        title={t('title', { unit: unitCode })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={action.pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          action.run(() => archiveUnitAction(unitId));
          setOpen(false);
        }}
      >
        {t('body')}
      </ConfirmDialog>
    </>
  );
}
