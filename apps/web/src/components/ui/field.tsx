'use client';

import { CircleAlert, ChevronDown } from 'lucide-react';
import { createContext, useContext, useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { InfoButton } from './info-button';

interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldProps(): Partial<
  Pick<ComponentProps<'input'>, 'id' | 'aria-describedby' | 'aria-invalid'>
> {
  const field = useContext(FieldContext);
  if (!field) return {};
  return {
    id: field.id,
    'aria-describedby': field.describedBy,
    'aria-invalid': field.invalid || undefined,
  };
}

export interface FieldProps {
  /** Always visible above the control (never only a placeholder). */
  label: ReactNode;
  /** Optional help, shown behind an info button next to the label instead of as permanent text. */
  info?: { label: string; text: ReactNode };
  /** Error text: what happened and what to do. Rendered with an icon, never color alone. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Label + control + error (+ optional info button). Wire it around an `Input` or `Select`; ids and ARIA are handled here. */
export function Field({ label, info, error, className, children }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error) }}>
      <div className={cn('flex flex-col gap-2', className)}>
        {info ? (
          <div className="flex items-center gap-1">
            <label htmlFor={id} className="text-app-subheading">
              {label}
            </label>
            <InfoButton label={info.label}>{info.text}</InfoButton>
          </div>
        ) : (
          <label htmlFor={id} className="text-app-subheading">
            {label}
          </label>
        )}
        {children}
        {error ? (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-app-caption text-danger"
          >
            <CircleAlert
              aria-hidden="true"
              className="mt-px size-[1.2em] shrink-0"
              strokeWidth={2}
            />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const control =
  'block w-full min-h-(--control-height) rounded-input border-2 border-transparent bg-surface-2 px-4 py-2 text-app-body text-text-primary placeholder:text-text-placeholder aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(control, className)}
      {...useFieldProps()}
      {...props}
    />
  );
}

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(control, 'resize-y', className)}
      {...useFieldProps()}
      {...props}
    />
  );
}

export type SelectProps = ComponentProps<'select'>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          control,
          'cursor-pointer appearance-none pr-11',
          className,
        )}
        {...useFieldProps()}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-text-secondary"
        strokeWidth={2}
      />
    </div>
  );
}
