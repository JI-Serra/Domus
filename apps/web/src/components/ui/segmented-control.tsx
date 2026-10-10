'use client';

import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  legend: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Radio group styled as a segmented control. The selected option shows a check mark, not only a fill. */
export function SegmentedControl<T extends string>({
  legend,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-2 text-app-subheading">{legend}</legend>
      <div className="flex gap-1 rounded-button bg-surface-2 p-1">
        {options.map((option) => (
          <label key={option.value} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex min-h-[calc(var(--control-height)-8px)] cursor-pointer items-center justify-center gap-1.5 rounded-button px-3 text-center text-app-body-dense peer-checked:bg-surface-0 peer-checked:font-semibold peer-focus-visible:outline-(length:--ring-width) peer-focus-visible:outline-accent peer-focus-visible:outline-solid peer-focus-visible:outline-offset-2 [&>svg]:hidden peer-checked:[&>svg]:block">
              <Check
                aria-hidden="true"
                className="size-[1.1em] shrink-0"
                strokeWidth={2.5}
              />
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
