'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';

export interface SheetProps {
  open: boolean;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Bottom sheet on mobile (28 px top radius, handle, actions at the thumb) and a centered modal from `sm` up
 * (DESIGN.md §A.6). Built on the native `<dialog>`: focus is trapped, Escape and the backdrop close it, and the page
 * behind is inert. The content is mounted only while open, so every opening starts from a clean form.
 */
export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        // Escape closes an open info popover first (its own handler does it), not the whole sheet.
        if (
          event.key === 'Escape' &&
          ref.current?.querySelector('[aria-expanded="true"]')
        )
          event.preventDefault();
      }}
      onClick={(event) => {
        // A press on the backdrop lands on the dialog element itself, never on its content.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-card bg-surface-0 p-0 text-text-primary backdrop:bg-overlay max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">
          <span
            aria-hidden="true"
            className="mx-auto h-1 w-10 rounded-full bg-hairline sm:hidden"
          />
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="min-w-0 text-app-heading">
              {title}
            </h2>
            <Button
              variant="secondary"
              size="icon"
              aria-label={closeLabel}
              onClick={onClose}
              className="rounded-full"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={2} />
            </Button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
