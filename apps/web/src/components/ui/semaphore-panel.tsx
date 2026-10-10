import { iconSize } from '@domus/ui-tokens';
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Access decision values from GLOSSARY.md (`access_decision`). */
export type AccessDecision = 'green' | 'yellow' | 'red';

const presentation: Record<
  AccessDecision,
  { Icon: LucideIcon; surface: string; ink: string }
> = {
  green: { Icon: CircleCheck, surface: 'bg-success-bg', ink: 'text-success' },
  yellow: { Icon: CircleAlert, surface: 'bg-warning-bg', ink: 'text-warning' },
  red: { Icon: CircleX, surface: 'bg-danger-bg', ink: 'text-danger' },
};

export interface SemaphorePanelProps {
  decision: AccessDecision;
  /** The outcome in words ("Permitido", "Requiere aprobación", "Restringido"). Never color alone. */
  result: string;
  /** Why the decision was taken. */
  reason: string;
  /** Name of the access rule that produced the decision. */
  ruleName: string;
  /** Who authorized the access (person or role). */
  authorizedBy: string;
  /** Primary action (a `Button` with `size="panel"`). */
  children?: ReactNode;
  /** Occupy at least half of the viewport, as the gate console requires (DESIGN.md §A.6). Default: true. */
  fill?: boolean;
  /** Announce the result to assistive technology (`alert` for red, `status` otherwise). Default: true. */
  live?: boolean;
  className?: string;
}

/** Traffic-light panel ("panel semáforo"): color + icon + result text + reason + rule applied + who authorized. */
export function SemaphorePanel({
  decision,
  result,
  reason,
  ruleName,
  authorizedBy,
  children,
  fill = true,
  live = true,
  className,
}: SemaphorePanelProps) {
  const t = useTranslations('semaphore');
  const { Icon, surface, ink } = presentation[decision];

  return (
    <section
      data-decision={decision}
      role={live ? (decision === 'red' ? 'alert' : 'status') : undefined}
      className={cn(
        'flex flex-col gap-6 rounded-card p-6 sm:p-8',
        surface,
        fill && 'min-h-[50dvh]',
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        <Icon
          aria-hidden="true"
          className={cn('shrink-0', ink)}
          size={iconSize.semaphore}
          strokeWidth={2}
        />
        <p
          className={cn('text-app-result break-words', ink)}
          style={{ fontSize: 'min(var(--text-app-result), 11.5vw)' }}
        >
          {result}
        </p>
      </div>
      <p className="text-app-reason">{reason}</p>
      <dl className="flex flex-col gap-3 text-app-rule">
        <div>
          <dt className="font-semibold">{t('ruleLabel')}</dt>
          <dd>{ruleName}</dd>
        </div>
        <div>
          <dt className="font-semibold">{t('authorizedByLabel')}</dt>
          <dd>{authorizedBy}</dd>
        </div>
      </dl>
      {children ? <div className="mt-auto pt-2">{children}</div> : null}
    </section>
  );
}
