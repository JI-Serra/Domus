'use client';

import { useTranslations } from 'next-intl';

/** Words a message key from a Server Action (`registry.errors.*`); an unknown key reads as the generic failure. */
export function useErrorMessage() {
  const t = useTranslations('registry.errors');
  return (key: string | undefined): string | undefined =>
    key === undefined
      ? undefined
      : t.has(key as 'unknown')
        ? t(key as 'unknown')
        : t('unknown');
}
