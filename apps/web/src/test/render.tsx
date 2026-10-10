import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import type { MfaStep } from '@domus/domain/auth';
import type { ActiveContext } from '@domus/domain/context';
import messages from '../../messages/es-AR.json';
import { ActiveContextProvider } from '@/components/shell/active-context';
import { TenantStatusProvider } from '@/components/tenant/tenant-status';
import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import { MOCK_CONTEXTS } from '@/test/fixtures';

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
  } = {},
) {
  return renderWithIntl(
    <ActiveContextProvider
      contexts={options.contexts ?? MOCK_CONTEXTS}
      initialMembershipId={initialMembershipId}
      platformMfaStep={options.platformMfaStep ?? null}
    >
      <TenantStatusProvider status={options.tenantStatus ?? 'active'}>
        {ui}
      </TenantStatusProvider>
    </ActiveContextProvider>,
  );
}
