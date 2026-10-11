'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { rotateJoinCodeAction } from '@/app/(app)/home/actions';
import { useTenantWritable } from '@/components/tenant/tenant-status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InfoButton } from '@/components/ui/info-button';
import { ActionNotice, useActionRunner } from './notice';

/**
 * Unit code (D22). The database keeps only a hash, so an existing code can't be shown again: the holder generates a
 * new one (the old one stops working) and sees it once, here, with a way to copy it.
 */
export function JoinCodeSection() {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const { run, pending, notice } = useActionRunner();
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the code stays selectable on screen.
    }
  };

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <h2 className="text-app-heading">{t('sections.code')}</h2>
        <InfoButton label={t('code.infoLabel')}>{t('code.info')}</InfoButton>
      </div>
      <ActionNotice
        notice={notice && (notice.tone === 'error' || !code) ? notice : null}
      />
      {code ? (
        <div className="flex flex-col gap-2 rounded-card-dense bg-surface-0 p-4">
          <span className="text-app-caption text-text-secondary">
            {t('code.newCode')}
          </span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              data-testid="unit-code"
              className="tnum text-app-heading tracking-wider break-all select-all"
            >
              {code}
            </span>
            <Button
              variant="secondary"
              icon={
                copied ? (
                  <Check aria-hidden="true" className="size-5" />
                ) : (
                  <Copy aria-hidden="true" className="size-5" />
                )
              }
              onClick={() => void copy()}
            >
              {copied ? t('code.copied') : t('code.copy')}
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button
          variant={code ? 'secondary' : 'primary'}
          disabled={!writable || pending}
          onClick={() => setConfirming(true)}
        >
          {pending
            ? t('code.generating')
            : code
              ? t('code.rotate')
              : t('code.generate')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('code.confirmTitle')}
        confirmLabel={t('code.confirm')}
        cancelLabel={t('cancel')}
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => rotateJoinCodeAction(),
            (result) => {
              setConfirming(false);
              if (result.status === 'success' && result.value) {
                setCode(result.value);
                setCopied(false);
              }
            },
          )
        }
      >
        {t('code.confirmBody')}
      </ConfirmDialog>
    </Card>
  );
}
