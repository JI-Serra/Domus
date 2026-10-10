'use client';

import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePopover } from './use-popover';

const POPOVER_MAX_WIDTH = 320;
const POPOVER_MARGIN = 16;

export interface InfoButtonProps {
  /** Accessible name of the button (for example "Más información sobre los colores"). */
  label: string;
  /** Help text shown in the popover. */
  children: ReactNode;
  className?: string;
}

/**
 * Icon "i" button that opens a popover with help text, so screens don't carry permanent explanations (DESIGN.md
 * §A.9). Opens on click, tap or keyboard; closes on Escape (focus returns to the button), on an outside press and
 * when focus leaves. The popover lines up with the button's left edge, or its right edge when that would run off
 * the screen.
 */
export function InfoButton({ label, children, className }: InfoButtonProps) {
  const { open, toggle, triggerRef, rootProps } = usePopover();
  const panelId = useId();
  const [alignEnd, setAlignEnd] = useState(false);

  const onClick = () => {
    if (!open && triggerRef.current) {
      const panelWidth = Math.min(
        POPOVER_MAX_WIDTH,
        window.innerWidth - 2 * POPOVER_MARGIN,
      );
      setAlignEnd(
        triggerRef.current.getBoundingClientRect().left + panelWidth >
          window.innerWidth - POPOVER_MARGIN,
      );
    }
    toggle();
  };

  return (
    <div {...rootProps} className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onClick}
        className="inline-flex size-(--control-height) shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary transition-colors duration-(--duration-ui) hover:bg-surface-2 hover:text-text-primary"
      >
        <Info aria-hidden="true" className="size-5" strokeWidth={2} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className={cn(
            'absolute top-full z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-card-dense border border-hairline bg-surface-0 p-4 text-app-body-dense text-text-primary',
            alignEnd ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
