import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderWithShell } from '@/test/render';
import HomePage from './page';

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const messages = (await import('../../../messages/es-AR.json')).default;
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: 'es-AR',
        messages,
        namespace: namespace as never,
      }),
  };
});

it('renders the page title, the active context and the section shortcuts inside the main landmark', async () => {
  const page = await HomePage();
  const { container } = renderWithShell(<main>{page}</main>);

  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { name: 'Inicio', level: 1 }),
  );
  expect(container).toHaveTextContent('Las Acacias');
  expect(container).toHaveTextContent('Titular');
  expect(container).toHaveTextContent('Lote 24');
  // The titular's role offers the resident sections as shortcuts.
  expect(screen.getByRole('link', { name: 'Accesos' })).toHaveAttribute(
    'href',
    '/access',
  );
  expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
});
