import { iconSize } from '@domus/ui-tokens';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The single primary action. */
  action?: ReactNode;
  className?: string;
}

/** Empty state: 48 px line icon, 22 px title, one sentence and one primary action (DESIGN.md §A.6). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 py-8 sm:items-center sm:text-center',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className="text-text-secondary"
        size={iconSize.emptyState}
        strokeWidth={1.5}
      />
      <h2 className="text-app-heading">{title}</h2>
      <p className="max-w-prose text-text-secondary">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
