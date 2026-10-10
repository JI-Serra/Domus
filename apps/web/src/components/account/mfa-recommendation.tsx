'use client';

import { ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { InfoButton } from '@/components/ui/info-button';

const STORAGE_KEY = 'domus.mfa-recommendation-dismissed';
const listeners = new Set<() => void>();

/** Per-browser convenience only (the choice is not security state): storage may be missing or blocked. */
function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Without storage the recommendation simply comes back on the next visit.
  }
  for (const notify of listeners) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Dismissible recommendation for tenant admins to enable two-step verification (M01-F05). It lives on the security
 * page only: no banners elsewhere. Hidden for good once dismissed in this browser.
 */
export function MfaRecommendation() {
  const t = useTranslations('account.security.recommendation');
  // Server render and hydration show it; the stored dismissal then hides it.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false);
  if (dismissed) return null;
  return (
    <section
      aria-label={t('title')}
      className="flex items-center gap-3 rounded-card-dense bg-surface-1 p-4"
    >
      <ShieldCheck
        aria-hidden="true"
        className="size-6 shrink-0"
        strokeWidth={1.75}
      />
      <p className="min-w-0 flex-1 text-app-subheading">{t('title')}</p>
      <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
      <Button
        variant="secondary"
        size="icon"
        aria-label={t('dismiss')}
        onClick={dismiss}
      >
        <X aria-hidden="true" className="size-5" strokeWidth={2} />
      </Button>
    </section>
  );
}
