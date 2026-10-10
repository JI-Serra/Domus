'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { useActiveContext } from './active-context';
import type { ActiveContext } from './active-context';
import { usePopover } from '@/components/ui/use-popover';

/** Tenant name, or "Plataforma" for the platform context (which has no tenant). */
export function useContextTitle() {
  const t = useTranslations('context');
  return (context: ActiveContext): string =>
    context.tenant_name ?? t('platformName');
}

/** "Rol · Unidad" line shown under the tenant name. */
export function useContextDescription() {
  const t = useTranslations();
  return (context: ActiveContext): string => {
    const role = t(`roles.${context.membership_role}`);
    return context.unit_name
      ? t('context.summaryWithUnit', { role, unit: context.unit_name })
      : t('context.summary', { role });
  };
}

/**
 * Always-visible active context (tenant + role + unit) with a switcher for the user's other memberships
 * (spec §6.1). Reads and writes through {@link useActiveContext}, so it works with mock or real memberships.
 */
export function ContextSelector({ className }: { className?: string }) {
  const t = useTranslations('context');
  const { contexts, active, switchContext } = useActiveContext();
  const describe = useContextDescription();
  const title = useContextTitle();
  const { open, toggle, close, triggerRef, rootProps } = usePopover();
  const panelId = useId();
  const canSwitch = contexts.length > 1;

  const label = (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate text-app-subheading">{title(active)}</span>
      <span className="truncate text-app-caption text-text-secondary">
        {describe(active)}
      </span>
    </span>
  );

  if (!canSwitch) {
    return (
      <div
        className={cn(
          'flex min-h-(--control-height) min-w-0 items-center px-3',
          className,
        )}
        aria-label={t('label')}
        role="group"
      >
        {label}
      </div>
    );
  }

  return (
    <div {...rootProps} className={cn('relative min-w-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('triggerLabel', {
          tenant: title(active),
          description: describe(active),
        })}
        onClick={toggle}
        className="flex min-h-(--control-height) w-full min-w-0 cursor-pointer items-center gap-2 rounded-input px-3 py-1 hover:bg-surface-2"
      >
        {label}
        <ChevronsUpDown
          aria-hidden="true"
          className="size-5 shrink-0 text-text-secondary"
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={t('switchTitle')}
          className="absolute top-full left-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card-dense border border-hairline bg-surface-0 p-2"
        >
          <p className="px-3 py-2 text-app-caption text-text-secondary">
            {t('switchTitle')}
          </p>
          <ul className="flex flex-col gap-1">
            {contexts.map((context) => {
              const isActive = context.membership_id === active.membership_id;
              return (
                <li key={context.membership_id}>
                  <button
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => {
                      switchContext(context.membership_id);
                      close();
                      triggerRef.current?.focus();
                    }}
                    className={cn(
                      'flex min-h-(--control-height) w-full cursor-pointer items-center gap-3 rounded-input px-3 py-2 text-left hover:bg-surface-1',
                      isActive && 'bg-surface-2',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-app-subheading">
                        {title(context)}
                      </span>
                      <span className="truncate text-app-caption text-text-secondary">
                        {describe(context)}
                      </span>
                    </span>
                    {isActive ? (
                      <>
                        <Check
                          aria-hidden="true"
                          className="size-5 shrink-0"
                          strokeWidth={2.5}
                        />
                        <span className="sr-only">{t('current')}</span>
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
