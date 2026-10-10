'use client';

import { SunMoon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { ThemeControls } from '@/components/theme/theme-controls';
import { Button } from '@/components/ui/button';
import { usePopover } from '@/components/ui/use-popover';

/** Top-bar button that opens the theme and "modo garita" controls. */
export function AppearanceMenu() {
  const t = useTranslations('theme');
  const { open, toggle, triggerRef, rootProps } = usePopover();
  const panelId = useId();

  return (
    <div {...rootProps} className="relative">
      <Button
        ref={triggerRef}
        variant="secondary"
        size="icon"
        aria-label={t('menuLabel')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <SunMoon aria-hidden="true" className="size-5" strokeWidth={2} />
      </Button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={t('menuLabel')}
          className="absolute top-full right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-card-dense border border-hairline bg-surface-0 p-4"
        >
          <ThemeControls />
        </div>
      ) : null}
    </div>
  );
}
