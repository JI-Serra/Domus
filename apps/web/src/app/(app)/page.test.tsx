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

it('renders the page title and the active context inside the main landmark', async () => {
  const page = await HomePage();
  const { container } = renderWithShell(<main>{page}</main>);

  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { name: 'Inicio', level: 1 }),
  );
  expect(container).toHaveTextContent('Las Acacias');
  expect(container).toHaveTextContent('Titular');
  expect(container).toHaveTextContent('Lote 24');
  // 18:30 UTC is 15:30 in Tucumán (UTC-3).
  expect(container).toHaveTextContent('09/10/2026 15:30');
});
