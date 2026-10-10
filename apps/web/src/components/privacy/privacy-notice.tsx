import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InfoButton } from '@/components/ui/info-button';

/**
 * Privacy notice for residents (spec §12, Ley 25.326): one short line, with the full text behind the info button.
 * Shown before the resident creates their account (invitation page) and when they ask to join with a unit code.
 */
export function PrivacyNotice({ className }: { className?: string }) {
  const t = useTranslations('privacy');
  return (
    <div className={className}>
      <div className="flex items-center gap-1 text-app-body-dense text-text-secondary">
        <ShieldCheck
          aria-hidden="true"
          className="size-5 shrink-0"
          strokeWidth={1.75}
        />
        <p>{t('notice')}</p>
        <InfoButton label={t('infoLabel')}>
          <span className="flex flex-col gap-2">
            <span className="text-app-subheading">{t('title')}</span>
            <span>{t('full')}</span>
          </span>
        </InfoButton>
      </div>
    </div>
  );
}
