import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';

vi.mock('@/app/(app)/actions', () => ({ signOutAction: vi.fn() }));
const { CancelledTenants } = await import('./cancelled-tenants');

describe('CancelledTenants', () => {
  it('says the barrio was cancelled, names it, and offers only the way out', () => {
    renderWithIntl(
      <CancelledTenants
        tenants={[{ tenant_id: 't', tenant_name: 'Los Ceibos' }]}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Tu barrio fue dado de baja' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Los Ceibos')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no tenés un barrio asignado'),
    ).toBeNull();
  });

  it('names every cancelled barrio', () => {
    renderWithIntl(
      <CancelledTenants
        tenants={[
          { tenant_id: 'a', tenant_name: 'Los Ceibos' },
          { tenant_id: 'b', tenant_name: 'Las Tipas' },
        ]}
      />,
    );
    expect(screen.getByText('Los Ceibos, Las Tipas')).toBeInTheDocument();
  });
});
