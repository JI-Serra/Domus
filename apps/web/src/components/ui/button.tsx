import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
/**
 * - `md`: 44 px, becomes 56 px automatically in "modo garita" (via `--control-height`).
 * - `gate`: always 56 px.
 * - `panel`: 64 px full-width primary action of the traffic-light panel.
 * - `icon`: square icon-only button (needs an `aria-label`).
 */
export type ButtonSize = 'md' | 'gate' | 'panel' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 rounded-button text-app-body select-none cursor-pointer transition-[filter,background-color] duration-(--duration-ui) hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent',
  secondary: 'bg-surface-2 text-text-primary',
  ghost:
    'border border-text-primary bg-transparent text-text-primary hover:bg-surface-1',
  destructive: 'bg-danger-bg text-danger',
};

const sizes: Record<ButtonSize, string> = {
  md: 'min-h-(--control-height) px-5 py-2 whitespace-nowrap',
  gate: 'min-h-(--touch-garita) px-6 py-2 whitespace-nowrap',
  panel:
    'min-h-(--touch-primary-action) w-full px-6 py-3 text-center text-app-heading',
  icon: 'size-(--control-height) shrink-0',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon; decorative, so the label must carry the meaning. */
  icon?: ReactNode;
}

export type ButtonProps = ButtonOwnProps & ComponentProps<'button'>;

export function Button({
  variant,
  size,
  icon,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export type ButtonLinkProps = ButtonOwnProps & ComponentProps<typeof Link>;

/** A link that looks like a button (navigation, not an action). */
export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}
