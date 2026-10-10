/** WCAG 2.1 contrast helpers for six-digit hex colors. Used by the token tests and available to the design page. */

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1])
    throw new RangeError(`Expected a #rrggbb color, received "${hex}"`);
  const value = parseInt(match[1], 16);
  const r = channel((value >> 16) & 255);
  const g = channel((value >> 8) & 255);
  const b = channel(value & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
