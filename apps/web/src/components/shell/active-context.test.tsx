import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import messages from '../../../messages/es-AR.json';
import { renderWithIntl } from '@/test/render';
import { ActiveContextProvider, useActiveContext } from './active-context';
import { ContextSelector } from './context-selector';
import { MOCK_CONTEXTS } from '@/test/fixtures';

function Probe() {
  useActiveContext();
  return null;
}

it('useActiveContext fails loudly outside a provider', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() => render(<Probe />)).toThrow(/ActiveContextProvider/);
  quiet.mockRestore();
});

it('the provider needs at least one context', () => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  expect(() =>
    render(
      <ActiveContextProvider contexts={[]}>
        <Probe />
      </ActiveContextProvider>,
    ),
  ).toThrow(/at least one context/);
  quiet.mockRestore();
});

it('a person with a single membership sees the context without a switcher', () => {
  const [only] = MOCK_CONTEXTS;
  if (!only) throw new Error('fixture missing');
  renderWithIntl(
    <ActiveContextProvider contexts={[only]}>
      <ContextSelector />
    </ActiveContextProvider>,
  );
  expect(
    screen.getByRole('group', { name: 'Contexto activo' }),
  ).toHaveTextContent('Las Acacias');
  expect(screen.queryByRole('button')).toBeNull();
});

it('reports the switched context to onSwitch so the auth task can persist it', () => {
  const onSwitch = vi.fn();
  const [first, second] = MOCK_CONTEXTS;
  if (!first || !second) throw new Error('fixtures missing');

  function Switcher() {
    const { switchContext } = useActiveContext();
    return (
      <button
        type="button"
        onClick={() => switchContext(second!.membership_id)}
      >
        switch
      </button>
    );
  }

  renderWithIntl(
    <ActiveContextProvider contexts={MOCK_CONTEXTS} onSwitch={onSwitch}>
      <Switcher />
    </ActiveContextProvider>,
  );
  screen.getByRole('button', { name: 'switch' }).click();
  expect(onSwitch).toHaveBeenCalledWith(second);
});

it('follows the server when the validated initial context changes', () => {
  const [first, second] = MOCK_CONTEXTS;
  if (!first || !second) throw new Error('fixtures missing');

  function Active() {
    const { active } = useActiveContext();
    return <p>{active.membership_id}</p>;
  }

  const view = renderWithIntl(
    <ActiveContextProvider
      contexts={MOCK_CONTEXTS}
      initialMembershipId={first.membership_id}
    >
      <Active />
    </ActiveContextProvider>,
  );
  expect(screen.getByText(first.membership_id)).toBeInTheDocument();

  view.rerender(
    <NextIntlClientProvider
      locale="es-AR"
      messages={messages}
      timeZone="America/Argentina/Tucuman"
    >
      <ActiveContextProvider
        contexts={MOCK_CONTEXTS}
        initialMembershipId={second.membership_id}
      >
        <Active />
      </ActiveContextProvider>
    </NextIntlClientProvider>,
  );
  expect(screen.getByText(second.membership_id)).toBeInTheDocument();
});

it('shows the platform context as "Plataforma" without a tenant name', () => {
  const [first] = MOCK_CONTEXTS;
  if (!first) throw new Error('fixture missing');
  renderWithIntl(
    <ActiveContextProvider
      contexts={[
        first,
        {
          membership_id: 'platform',
          tenant_id: null,
          tenant_name: null,
          tenant_time_zone: 'America/Argentina/Tucuman',
          membership_role: 'platform_admin',
          unit_id: null,
          unit_name: null,
        },
      ]}
      initialMembershipId="platform"
    >
      <ContextSelector />
    </ActiveContextProvider>,
  );
  expect(
    screen.getByRole('button', { name: /^Contexto activo: Plataforma/ }),
  ).toBeInTheDocument();
});
