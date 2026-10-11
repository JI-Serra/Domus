import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import type { MfaStep } from '@domus/domain/auth';
import type { ActiveContext } from '@domus/domain/context';
import baseMessages from '../../messages/es-AR.json';
import registryMessages from '../../messages/registry.es-AR.json';
import { ActiveContextProvider } from '@/components/shell/active-context';
import { AdminPermissionsProvider } from '@/components/shell/admin-permissions';
import type { AdminPermission } from '@/lib/registry/permissions';
import { TenantStatusProvider } from '@/components/tenant/tenant-status';
import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import { MOCK_CONTEXTS } from '@/test/fixtures';

const messages = { ...baseMessages, ...registryMessages };

/** Renders with the es-AR messages, as the root layout does. */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="es-AR"
      messages={messages}
      timeZone="America/Argentina/Tucuman"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Renders with the es-AR messages and the mock memberships; `initialMembershipId` picks the starting role. */
export function renderWithShell(
  ui: ReactElement,
  initialMembershipId?: string,
  options: {
    tenantStatus?: TenantSubscriptionStatus | null;
    contexts?: readonly ActiveContext[];
    platformMfaStep?: MfaStep | null;
    /** Administrative permissions of the active administrator; defaults to the ones the Padrón area needs. */
    adminPermissions?: readonly AdminPermission[];
  } = {},
) {
  return renderWithIntl(
    <ActiveContextProvider
      contexts={options.contexts ?? MOCK_CONTEXTS}
      initialMembershipId={initialMembershipId}
      platformMfaStep={options.platformMfaStep ?? null}
    >
      <TenantStatusProvider status={options.tenantStatus ?? 'active'}>
        <AdminPermissionsProvider
          permissions={options.adminPermissions ?? ['registry', 'guards']}
        >
          {ui}
        </AdminPermissionsProvider>
      </TenantStatusProvider>
    </ActiveContextProvider>,
  );
}
