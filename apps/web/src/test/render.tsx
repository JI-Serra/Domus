import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import messages from '../../messages/es-AR.json';
import { ActiveContextProvider } from '@/components/shell/active-context';
import { MOCK_CONTEXTS } from '@/components/shell/mock-active-context';

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
) {
  return renderWithIntl(
    <ActiveContextProvider
      contexts={MOCK_CONTEXTS}
      initialMembershipId={initialMembershipId}
    >
      {ui}
    </ActiveContextProvider>,
  );
}
