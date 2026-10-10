'use client';

import { DEFAULT_TENANT_TIME_ZONE } from '@domus/domain/format';
import type { ReactNode } from 'react';
import { ActiveContextProvider } from './active-context';
import type { ActiveContext } from './active-context';

/**
 * Fictional memberships used until authentication exists (M00-F04). They cover every role the shell renders
 * navigation for, including a person with several memberships (spec §6.1).
 */
export const MOCK_CONTEXTS: readonly ActiveContext[] = [
  {
    membership_id: '00000000-0000-4000-8000-000000000001',
    tenant_id: '00000000-0000-4000-8000-0000000000a1',
    tenant_name: 'Las Acacias',
    tenant_time_zone: DEFAULT_TENANT_TIME_ZONE,
    membership_role: 'unit_holder',
    unit_id: '00000000-0000-4000-8000-0000000000b1',
    unit_name: 'Lote 24',
  },
  {
    membership_id: '00000000-0000-4000-8000-000000000002',
    tenant_id: '00000000-0000-4000-8000-0000000000a1',
    tenant_name: 'Las Acacias',
    tenant_time_zone: DEFAULT_TENANT_TIME_ZONE,
    membership_role: 'tenant_admin',
    unit_id: null,
    unit_name: null,
  },
  {
    membership_id: '00000000-0000-4000-8000-000000000003',
    tenant_id: '00000000-0000-4000-8000-0000000000a2',
    tenant_name: 'Altos del Tala',
    tenant_time_zone: DEFAULT_TENANT_TIME_ZONE,
    membership_role: 'guard',
    unit_id: null,
    unit_name: null,
  },
  {
    membership_id: '00000000-0000-4000-8000-000000000004',
    tenant_id: '00000000-0000-4000-8000-0000000000a2',
    tenant_name: 'Altos del Tala',
    tenant_time_zone: DEFAULT_TENANT_TIME_ZONE,
    membership_role: 'household_member',
    unit_id: '00000000-0000-4000-8000-0000000000b2',
    unit_name: 'Manzana C · Lote 7',
  },
];

/** Feeds the shell with {@link MOCK_CONTEXTS}. Swap this component for the real provider when auth lands. */
export function MockActiveContextProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ActiveContextProvider contexts={MOCK_CONTEXTS}>
      {children}
    </ActiveContextProvider>
  );
}
