'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from './button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen if the user confirms: the effect, stated plainly. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** `destructive` styles the confirm action as a risky one. */
  tone?: 'primary' | 'destructive';
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation built on the native `<dialog>`: focus is trapped inside, Escape cancels, and the page behind is
 * inert. The effect of the action is always spelled out in the body, never just "¿Estás seguro?".
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
        // Escape: let our state decide, so the dialog and the app never disagree.
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface-0 p-6 text-text-primary backdrop:bg-overlay"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-app-heading">
          {title}
        </h2>
        <div className="text-app-body text-text-primary">{children}</div>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
