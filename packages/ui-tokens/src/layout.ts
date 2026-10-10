/** Spacing, shape, touch, layout and motion tokens (DESIGN.md §A.6, §A.7, §A.8, §A.10 and Part B spacing). Values in px. */

export const spacingUnit = 4;

/** Part B spacing scale. Every value is a multiple of {@link spacingUnit}, so Tailwind's `p-4` = 16 px = "16". */
export const spacingScale = [
  4, 8, 12, 16, 20, 24, 28, 32, 40, 44, 48, 52, 76, 80, 120, 144,
] as const;

export const radius = {
  link: 10,
  input: 12,
  'card-dense': 16,
  card: 28,
  sheet: 28,
  badge: 36,
  button: 980,
  'button-small': 999,
  full: 9999,
} as const;

export const touch = {
  /** Minimum touch target in the resident app and the admin. */
  min: 44,
  /** Minimum touch target in "modo garita". */
  garita: 56,
  /** Primary action of the traffic-light panel. */
  primaryAction: 64,
} as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export const layout = {
  contentMaxWidth: 1200,
  contentWideMaxWidth: 1440,
  sidebarWidth: 240,
  tabBarHeight: 49,
  topBarHeight: 56,
  gutterMobile: 16,
  gutterDesktop: 24,
  cardPadding: 28,
  cardDensePadding: 16,
} as const;

/** The single functional shadow allowed by DESIGN.md §A.6 (modal over an overlay). */
export const shadow = { modal: '0 8px 32px rgb(0 0 0 / 0.18)' } as const;

export const iconSize = { default: 24, emptyState: 48, semaphore: 64 } as const;

export const motion = {
  /** Gate mode: no decorative animation, transitions at most this long (ms). */
  maxTransitionMs: 150,
} as const;

/** Focus ring width in px: 2 in the regular theme, 3 in "modo garita". */
export const focusRing = { default: 2, gate: 3 } as const;
