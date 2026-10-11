'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { AdminPermission } from '@/lib/registry/permissions';

const AdminPermissionsContext = createContext<readonly AdminPermission[]>([]);

/**
 * The administrative permissions of the active `tenant_admin` membership, as the server read them. They decide what
 * the navigation and the top bar offer; the database authorizes every operation on its own.
 */
export function AdminPermissionsProvider({
  permissions,
  children,
}: {
  permissions: readonly AdminPermission[];
  children: ReactNode;
}) {
  return (
    <AdminPermissionsContext.Provider value={permissions}>
      {children}
    </AdminPermissionsContext.Provider>
  );
}

export function useAdminPermissions(): readonly AdminPermission[] {
  return useContext(AdminPermissionsContext);
}
