'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './button';
import type { ButtonVariant } from './button';

export interface CopyTextButtonProps {
  /** The text that goes to the clipboard. */
  text: string;
  /** Button text, e.g. "Copiar". */
  label: string;
  /** Text after a successful copy; also announced to screen readers, e.g. "Copiado". */
  copiedLabel: string;
  variant?: ButtonVariant;
}

const RESET_AFTER_MS = 2500;

/**
 * Copies `text` to the clipboard and says so with an icon change and text (never color alone). When the clipboard is
 * not available (insecure context, denied permission) the button stays as it was: the text remains visible and
 * selectable next to it, so nothing is lost.
 */
export function CopyTextButton({
  text,
  label,
  copiedLabel,
  variant = 'secondary',
}: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_AFTER_MS);
  };

  const Icon = copied ? Check : Copy;
  return (
    <>
      <Button
        variant={variant}
        onClick={copy}
        icon={<Icon aria-hidden="true" className="size-5" strokeWidth={2} />}
      >
        {copied ? copiedLabel : label}
      </Button>
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}
