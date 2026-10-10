/**
 * Semantic colors. Source: KnowledgeBase/DESIGN.md Part A (§A.3 semantic, §A.4 surfaces and text) plus the
 * Part B palette entries that the app actually uses (Primary Ink, Mid Gray, Deep Gray, Hairline, Canvas, Cool Wash,
 * Electric Blue, Link Blue, Ember).
 *
 * Four resolved themes exist: `light`, `dark` and their high-contrast "modo garita" variants. Token names are the CSS
 * variable names without the `--color-` prefix, so the web CSS is generated one-to-one from these objects.
 */

export type ThemeName = 'light' | 'dark' | 'gate-light' | 'gate-dark';

export const colorTokenNames = [
  'surface-0',
  'surface-1',
  'surface-2',
  'text-primary',
  'text-secondary',
  'text-placeholder',
  'hairline',
  'accent',
  'on-accent',
  'success',
  'success-bg',
  'warning',
  'warning-bg',
  'danger',
  'danger-bg',
  'info',
  'offline',
  'ember',
  'overlay',
] as const;

export type ColorToken = (typeof colorTokenNames)[number];
export type ColorTheme = Record<ColorToken, string>;

const light = {
  'surface-0': '#ffffff',
  'surface-1': '#f5f5f7',
  'surface-2': '#e8e8ed',
  'text-primary': '#1d1d1f',
  'text-secondary': '#707070',
  'text-placeholder': '#5f5f5f',
  hairline: '#d6d6d6',
  accent: '#0071e3',
  'on-accent': '#ffffff',
  success: '#187a35',
  'success-bg': '#e6f4ea',
  warning: '#9a5b00',
  'warning-bg': '#fff4e0',
  danger: '#c62828',
  'danger-bg': '#fdecea',
  info: '#0066cc',
  offline: '#474747',
  ember: '#b64400',
  overlay: 'rgb(0 0 0 / 0.4)',
} as const satisfies ColorTheme;

const dark = {
  'surface-0': '#000000',
  'surface-1': '#1c1c1e',
  'surface-2': '#2c2c2e',
  'text-primary': '#f5f5f7',
  'text-secondary': '#a1a1a6',
  'text-placeholder': '#a1a1a6',
  hairline: '#38383a',
  accent: '#0a84ff',
  'on-accent': '#000000',
  success: '#3fb950',
  'success-bg': '#12261a',
  warning: '#e3a33b',
  'warning-bg': '#2b2111',
  danger: '#ff6b62',
  'danger-bg': '#2d1414',
  info: '#4da3ff',
  offline: '#a1a1a6',
  ember: '#ff9a63',
  overlay: 'rgb(0 0 0 / 0.4)',
} as const satisfies ColorTheme;

/** "Modo garita" (DESIGN.md §A.7): every text pair reaches at least 7:1 (AAA). */
const gateLight = {
  'surface-0': '#ffffff',
  'surface-1': '#f5f5f7',
  'surface-2': '#e8e8ed',
  'text-primary': '#000000',
  'text-secondary': '#404040',
  'text-placeholder': '#404040',
  hairline: '#767676',
  accent: '#00479e',
  'on-accent': '#ffffff',
  success: '#0b5a22',
  'success-bg': '#e6f4ea',
  warning: '#6b3d00',
  'warning-bg': '#fff4e0',
  danger: '#8f1010',
  'danger-bg': '#fdecea',
  info: '#004a99',
  offline: '#333333',
  ember: '#8a3300',
  overlay: 'rgb(0 0 0 / 0.4)',
} as const satisfies ColorTheme;

const gateDark = {
  'surface-0': '#000000',
  'surface-1': '#1c1c1e',
  'surface-2': '#2c2c2e',
  'text-primary': '#ffffff',
  'text-secondary': '#d1d1d6',
  'text-placeholder': '#d1d1d6',
  hairline: '#8e8e93',
  accent: '#82bfff',
  'on-accent': '#000000',
  success: '#6fdc84',
  'success-bg': '#12261a',
  warning: '#ffc15c',
  'warning-bg': '#2b2111',
  danger: '#ff9089',
  'danger-bg': '#2d1414',
  info: '#82bfff',
  offline: '#d1d1d6',
  ember: '#ffab7a',
  overlay: 'rgb(0 0 0 / 0.4)',
} as const satisfies ColorTheme;

export const colors: Record<ThemeName, ColorTheme> = {
  light,
  dark,
  'gate-light': gateLight,
  'gate-dark': gateDark,
};

/** Semantic states that always render as color + icon + text, never color alone (DESIGN.md §A.3). */
export const semanticStates = [
  'success',
  'warning',
  'danger',
  'info',
  'offline',
] as const;
export type SemanticState = (typeof semanticStates)[number];
