import { CircleAlert, CircleCheck, CircleX, Info, WifiOff } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Semantic system states (DESIGN.md §A.3). `ember` is the informative "Nuevo" / "Pendiente" accent. */
export type BadgeTone =
  'neutral' | 'ember' | 'success' | 'warning' | 'danger' | 'info' | 'offline';
export type StatusTone = Exclude<BadgeTone, 'neutral' | 'ember'>;

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-text-primary',
  ember: 'border border-hairline bg-surface-0 text-ember',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'border border-hairline bg-surface-0 text-info',
  offline: 'border border-hairline bg-surface-0 text-offline',
};

const statusIcons: Record<StatusTone, LucideIcon> = {
  success: CircleCheck,
  warning: CircleAlert,
  danger: CircleX,
  info: Info,
  offline: WifiOff,
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Optional decorative icon placed before the text. */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = 'neutral',
  icon,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-badge px-3 py-1 text-app-micro whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export interface StatusBadgeProps {
  status: StatusTone;
  className?: string;
  /** The visible state name ("Pagado", "Sin conexión"). State is always icon + text, never color alone. */
  children: ReactNode;
}

export function StatusBadge({ status, className, children }: StatusBadgeProps) {
  const Icon = statusIcons[status];
  return (
    <Badge
      tone={status}
      className={className}
      icon={
        <Icon
          aria-hidden="true"
          className="size-[1.25em] shrink-0"
          strokeWidth={2}
        />
      }
    >
      {children}
    </Badge>
  );
}
