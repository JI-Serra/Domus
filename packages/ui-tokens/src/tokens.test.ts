import { describe, expect, it } from 'vitest';
import { colorTokenNames, colors } from './colors.ts';
import type { ColorToken, ThemeName } from './colors.ts';
import { contrastRatio, relativeLuminance } from './contrast.ts';
import { generateTokensCss } from './css.ts';
import { spacingScale, spacingUnit, touch } from './layout.ts';
import { gateTypeScale, typeRoles, typeScale } from './typography.ts';

const themes = Object.keys(colors) as ThemeName[];
const isGate = (theme: ThemeName) => theme.startsWith('gate');

/** Minimum text contrast: AA (4.5) in regular themes, AAA (7) in "modo garita" (DESIGN.md §A.7). */
const minimumText = (theme: ThemeName) => (isGate(theme) ? 7 : 4.5);
const hexOf = (theme: ThemeName, token: ColorToken) => colors[theme][token];

describe('color tokens', () => {
  it.each(themes)('%s defines every token', (theme) => {
    expect(Object.keys(colors[theme]).sort()).toEqual(
      [...colorTokenNames].sort(),
    );
  });

  it.each(themes)(
    '%s: primary and secondary text are readable on the surfaces they sit on',
    (theme) => {
      const min = minimumText(theme);
      for (const surface of ['surface-0', 'surface-1', 'surface-2'] as const) {
        expect(
          contrastRatio(hexOf(theme, 'text-primary'), hexOf(theme, surface)),
        ).toBeGreaterThanOrEqual(min);
      }
      // Secondary text is only used on surface-0/1; on surface-2 (inputs) the placeholder token takes over.
      for (const surface of ['surface-0', 'surface-1'] as const) {
        expect(
          contrastRatio(hexOf(theme, 'text-secondary'), hexOf(theme, surface)),
        ).toBeGreaterThanOrEqual(min);
      }
      expect(
        contrastRatio(
          hexOf(theme, 'text-placeholder'),
          hexOf(theme, 'surface-2'),
        ),
      ).toBeGreaterThanOrEqual(min);
    },
  );

  it.each(themes)(
    '%s: semantic states are readable on their background and on the surfaces',
    (theme) => {
      const min = minimumText(theme);
      for (const state of ['success', 'warning', 'danger'] as const) {
        expect(
          contrastRatio(hexOf(theme, state), hexOf(theme, `${state}-bg`)),
        ).toBeGreaterThanOrEqual(min);
        expect(
          contrastRatio(hexOf(theme, state), hexOf(theme, 'surface-0')),
        ).toBeGreaterThanOrEqual(min);
      }
      for (const state of ['info', 'offline', 'ember'] as const) {
        for (const surface of ['surface-0', 'surface-1'] as const) {
          expect(
            contrastRatio(hexOf(theme, state), hexOf(theme, surface)),
          ).toBeGreaterThanOrEqual(min);
        }
      }
    },
  );

  it.each(themes)(
    '%s: accent buttons and focus rings are distinguishable',
    (theme) => {
      expect(
        contrastRatio(hexOf(theme, 'on-accent'), hexOf(theme, 'accent')),
      ).toBeGreaterThanOrEqual(minimumText(theme));
      // WCAG 1.4.11: focus ring and control boundaries need 3:1 against adjacent colors.
      for (const surface of ['surface-0', 'surface-1', 'surface-2'] as const) {
        expect(
          contrastRatio(hexOf(theme, 'accent'), hexOf(theme, surface)),
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(['gate-light', 'gate-dark'] as const)(
    '%s: hairlines are visible (3:1)',
    (theme) => {
      expect(
        contrastRatio(hexOf(theme, 'hairline'), hexOf(theme, 'surface-0')),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it('computes known WCAG ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(() => relativeLuminance('red')).toThrow(RangeError);
  });
});

describe('typography and layout tokens', () => {
  it('defines every role in both scales', () => {
    for (const role of typeRoles) {
      expect(typeScale[role].fontSize).toBeGreaterThan(0);
      expect(gateTypeScale[role].fontSize).toBeGreaterThan(0);
    }
  });

  it('keeps the gate scale at 15 px or above and the base at 20 px', () => {
    for (const role of typeRoles) {
      expect(gateTypeScale[role].fontSize).toBeGreaterThanOrEqual(15);
    }
    expect(gateTypeScale['app-body'].fontSize).toBe(20);
    expect(gateTypeScale['app-result'].fontSize).toBeGreaterThanOrEqual(40);
  });

  it('keeps line height above font size', () => {
    for (const style of [
      ...Object.values(typeScale),
      ...Object.values(gateTypeScale),
    ]) {
      expect(style.lineHeight).toBeGreaterThan(style.fontSize);
    }
  });

  it('only uses multiples of the 4 px unit in the spacing scale', () => {
    for (const value of spacingScale) expect(value % spacingUnit).toBe(0);
  });

  it('matches the touch targets in DESIGN.md', () => {
    expect(touch).toEqual({ min: 44, garita: 56, primaryAction: 64 });
  });
});

describe('generated CSS', () => {
  const css = generateTokensCss();

  it('is deterministic', () => {
    expect(generateTokensCss()).toBe(css);
  });

  it('emits Tailwind theme variables, theme overrides and the gate mode', () => {
    expect(css).toContain('@theme static {');
    expect(css).toContain('--color-success: #187a35;');
    expect(css).toContain(
      "@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {",
    );
    expect(css).toContain(":root[data-theme='dark'] {");
    expect(css).toContain(":root[data-mode='gate'] {");
    expect(css).toContain('--control-height: var(--touch-garita);');
    expect(css).toContain('--text-app-body: 1.25rem;');
    expect(css).toContain('--radius-input: 12px;');
  });
});
