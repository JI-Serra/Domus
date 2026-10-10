'use client';

import { useEffect, useRef, useState } from 'react';
import type { FocusEvent } from 'react';

/**
 * Open/close state for a small dropdown panel: closes on Escape (returning focus to the trigger), on a pointer
 * press outside, and when keyboard focus leaves the component.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (
      open &&
      event.relatedTarget &&
      !event.currentTarget.contains(event.relatedTarget)
    )
      setOpen(false);
  };

  return {
    open,
    setOpen,
    close: () => setOpen(false),
    toggle: () => setOpen((value) => !value),
    triggerRef,
    rootProps: { ref: rootRef, onBlur },
  };
}
