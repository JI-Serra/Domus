import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form-level message. Errors are announced immediately (`role="alert"`), confirmations politely (`role="status"`);
 * both carry an icon so the state is never conveyed by color alone.
 */
export function AuthNotice({
  tone,
  title,
  children,
  className,
}: {
  tone: 'error' | 'success' | 'info';
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-card-dense p-4',
        tone === 'error' && 'bg-danger-bg text-danger',
        tone === 'success' && 'bg-success-bg text-success',
        tone === 'info' && 'bg-surface-2 text-text-primary',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0"
        strokeWidth={2}
      />
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className="text-app-subheading">{title}</p> : null}
        <p className="text-app-body-dense">{children}</p>
      </div>
    </div>
  );
}
