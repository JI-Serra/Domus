/** Seeded local users (README "Local data & test users"). Local-only: never run these tests against staging. */
export const PASSWORD = 'DomusLocal123!';

export const ACCOUNTS = {
  adminCeibos: 'admin.ceibos@domus.local',
  guardTipas: 'guard.tipas@domus.local',
  holderCeibos: 'holder.ceibos@domus.local',
  /** Unit holder in both tenants (separate tenant-scoped person rows). */
  shared: 'shared@domus.local',
} as const;

export const TENANT_IDS = {
  ceibos: '10000000-0000-0000-0000-000000000001',
  tipas: '10000000-0000-0000-0000-000000000002',
} as const;

export const TENANT_NAMES = {
  ceibos: 'Barrio Los Ceibos',
  tipas: 'Barrio Las Tipas',
} as const;
