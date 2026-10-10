/**
 * Product type scale (DESIGN.md §A.5) and "modo garita" scale (§A.7). Sizes and line heights are in px.
 * `app-result`, `app-reason` and `app-rule` cover the traffic-light panel text sizes from §A.6.
 */

export const fontFamilySans = [
  'Inter',
  'ui-sans-serif',
  'system-ui',
  '-apple-system',
  'Segoe UI',
  'Roboto',
  'sans-serif',
] as const;

/** OpenType feature for tabular figures: amounts, times, plates. */
export const numericFontFeature = '"tnum"';

export const typeRoles = [
  'app-display',
  'app-title',
  'app-heading',
  'app-subheading',
  'app-body',
  'app-body-dense',
  'app-caption',
  'app-micro',
  'app-result',
  'app-reason',
  'app-rule',
] as const;

export type TypeRole = (typeof typeRoles)[number];

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 500 | 600 | 700;
}

export const typeScale: Record<TypeRole, TypeStyle> = {
  'app-display': { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  'app-title': { fontSize: 28, lineHeight: 34, fontWeight: 600 },
  'app-heading': { fontSize: 22, lineHeight: 28, fontWeight: 600 },
  'app-subheading': { fontSize: 17, lineHeight: 24, fontWeight: 600 },
  'app-body': { fontSize: 17, lineHeight: 25, fontWeight: 400 },
  'app-body-dense': { fontSize: 15, lineHeight: 22, fontWeight: 400 },
  'app-caption': { fontSize: 13, lineHeight: 18, fontWeight: 400 },
  'app-micro': { fontSize: 12, lineHeight: 16, fontWeight: 500 },
  'app-result': { fontSize: 40, lineHeight: 48, fontWeight: 700 },
  'app-reason': { fontSize: 20, lineHeight: 28, fontWeight: 400 },
  'app-rule': { fontSize: 17, lineHeight: 25, fontWeight: 400 },
};

/** Base 20 px, titles 28–34 px, traffic-light result 56 px, nothing below 15 px. */
export const gateTypeScale: Record<TypeRole, TypeStyle> = {
  'app-display': { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  'app-title': { fontSize: 34, lineHeight: 40, fontWeight: 600 },
  'app-heading': { fontSize: 28, lineHeight: 34, fontWeight: 600 },
  'app-subheading': { fontSize: 22, lineHeight: 28, fontWeight: 600 },
  'app-body': { fontSize: 20, lineHeight: 28, fontWeight: 400 },
  'app-body-dense': { fontSize: 20, lineHeight: 28, fontWeight: 400 },
  'app-caption': { fontSize: 15, lineHeight: 20, fontWeight: 400 },
  'app-micro': { fontSize: 15, lineHeight: 20, fontWeight: 500 },
  'app-result': { fontSize: 56, lineHeight: 60, fontWeight: 700 },
  'app-reason': { fontSize: 22, lineHeight: 30, fontWeight: 400 },
  'app-rule': { fontSize: 20, lineHeight: 28, fontWeight: 400 },
};
