'use client';

import { FileUp, X } from 'lucide-react';
import { useId, useRef } from 'react';
import { Button } from './button';

export interface FilePickerProps {
  /** Name of the form field (when the file travels with the form). */
  name?: string;
  accept: string;
  /** Text of the choose button, e.g. "Elegir foto". Always localized by the caller: the native input is not. */
  chooseLabel: string;
  /** Shown while nothing is chosen, e.g. "Sin archivo". */
  emptyLabel: string;
  /** Accessible name of the remove button, e.g. "Quitar la foto". */
  clearLabel: string;
  /** Name of the current file, if any (the chosen one, or the stored one). */
  fileName?: string | null;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (file: File | null) => void;
}

/**
 * Localized file picker: the browser's native control shows its own language ("No file chosen"), so the input is
 * hidden and a button with the caller's text opens it. The chosen name sits next to it, with a way to clear it.
 */
export function FilePicker({
  name,
  accept,
  chooseLabel,
  emptyLabel,
  clearLabel,
  fileName,
  disabled,
  invalid,
  onChange,
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        disabled={disabled}
        aria-describedby={nameId}
        aria-invalid={invalid || undefined}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <Button
        variant="secondary"
        disabled={disabled}
        icon={<FileUp aria-hidden="true" className="size-5" strokeWidth={2} />}
        onClick={() => inputRef.current?.click()}
      >
        {chooseLabel}
      </Button>
      <span id={nameId} className="min-w-0 truncate text-app-body-dense">
        {fileName ?? <span className="text-text-secondary">{emptyLabel}</span>}
      </span>
      {fileName ? (
        <Button
          variant="secondary"
          size="icon"
          aria-label={clearLabel}
          disabled={disabled}
          onClick={() => {
            if (inputRef.current) inputRef.current.value = '';
            onChange(null);
          }}
        >
          <X aria-hidden="true" className="size-5" strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  );
}
