type ClassValue = string | false | null | undefined;

/** Joins class names, skipping falsy values. Variants are written so that classes never conflict. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
