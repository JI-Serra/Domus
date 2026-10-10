'use client';

import { useTranslations } from 'next-intl';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import type { ThemeChoice } from './theme-store';
import { useThemePreference } from './use-theme-preference';

/** Theme choice (system / light / dark) and "modo garita" switch, persisted per browser. */
export function ThemeControls({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const { preference, setTheme, setGate } = useThemePreference();

  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: t('system') },
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
  ];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <SegmentedControl
        legend={t('themeLegend')}
        options={options}
        value={preference.theme}
        onChange={setTheme}
      />
      <Switch
        label={t('gateLabel')}
        checked={preference.gate}
        onChange={(event) => setGate(event.target.checked)}
      />
    </div>
  );
}
