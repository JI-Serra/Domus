import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithShell } from '@/test/render';
import { useActiveContext } from './active-context';
import { AppShell } from './app-shell';
import { MOCK_CONTEXTS } from '@/test/fixtures';
import {
  getNavItemBySlug,
  getNavigation,
  getPlaceholderSlugs,
  getTabBarItems,
  isNavItemActive,
} from './navigation';
import type { MembershipRole } from './active-context';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const [HOLDER, ADMIN, GUARD, MEMBER] = MOCK_CONTEXTS.map(
  (context) => context.membership_id,
) as [string, string, string, string];

beforeEach(() => {
  pathname = '/';
});

describe('navigation model', () => {
  const roles: MembershipRole[] = [
    'platform_admin',
    'tenant_admin',
    'guard',
    'unit_holder',
    'household_member',
  ];

  it.each(roles)(
    '%s has a home entry and a tab bar of 2 to 5 destinations',
    (role) => {
      expect(getNavigation(role)[0]?.href).toBe('/');
      const tabs = getTabBarItems(role);
      expect(tabs.length).toBeGreaterThanOrEqual(2);
      expect(tabs.length).toBeLessThanOrEqual(5);
    },
  );

  it('gives residents Inicio · Accesos · Barrio · Cuenta', () => {
    expect(getTabBarItems('unit_holder').map((entry) => entry.id)).toEqual([
      'home',
      'access',
      'neighborhood',
      'account',
    ]);
  });

  it('keeps settings out of the admin tab bar but in the sidebar', () => {
    expect(
      getNavigation('tenant_admin').some((entry) => entry.id === 'settings'),
    ).toBe(true);
    expect(
      getTabBarItems('tenant_admin').some((entry) => entry.id === 'settings'),
    ).toBe(false);
  });

  it('resolves placeholder slugs', () => {
    expect(getPlaceholderSlugs()).toContain('guard-log');
    expect(getPlaceholderSlugs()).not.toContain('');
    expect(getNavItemBySlug('finance')?.id).toBe('finance');
    expect(getNavItemBySlug('nope')).toBeUndefined();
  });

  it('matches active routes by prefix, with home only on the root', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/access', '/')).toBe(false);
    expect(isNavItemActive('/access', '/access')).toBe(true);
    expect(isNavItemActive('/access/passes', '/access')).toBe(true);
    expect(isNavItemActive('/accessory', '/access')).toBe(false);
  });
});

describe('AppShell', () => {
  it('renders the sidebar and the tab bar as separate navigation landmarks', () => {
    renderWithShell(<AppShell>contenido</AppShell>, HOLDER);
    const navs = screen.getAllByLabelText('Navegación principal', {
      selector: 'nav',
      exact: true,
    });
    expect(navs).toHaveLength(2);
    expect(screen.getByRole('main')).toHaveTextContent('contenido');
    expect(
      screen.getByRole('link', { name: 'Saltar al contenido' }),
    ).toHaveAttribute('href', '#main');
  });

  it('marks the active destination with aria-current in both navigations', () => {
    pathname = '/access';
    renderWithShell(<AppShell>x</AppShell>, HOLDER);
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link).toHaveAttribute('href', '/access');
  });

  it('shows the active context in the top bar at all times', () => {
    renderWithShell(<AppShell>x</AppShell>, HOLDER);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent('Las Acacias');
    expect(banner).toHaveTextContent('Titular · Lote 24');
  });

  it('changes the navigation when the role changes', () => {
    renderWithShell(<AppShell>x</AppShell>, ADMIN);
    expect(
      screen.getAllByRole('link', { name: 'Padrón' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Ajustes' })).toHaveLength(1); // sidebar only
    expect(screen.queryByRole('link', { name: 'Cuenta' })).toBeNull();
  });

  it('lets the user switch context from the top bar', () => {
    renderWithShell(<AppShell>x</AppShell>, HOLDER);
    const banner = screen.getByRole('banner');

    fireEvent.click(
      within(banner).getByRole('button', { name: /Cambiar de contexto/ }),
    );
    const group = within(banner).getByRole('group', {
      name: 'Cambiar de contexto',
    });
    // The current context is announced and marked.
    expect(
      within(group).getByRole('button', { name: /Las Acacias.*Titular/ }),
    ).toHaveAttribute('aria-current', 'true');

    fireEvent.click(
      within(group).getByRole('button', { name: /Altos del Tala.*Guardia/ }),
    );
    expect(
      within(banner).queryByRole('group', { name: 'Cambiar de contexto' }),
    ).toBeNull();
    expect(banner).toHaveTextContent('Altos del Tala');
    expect(banner).toHaveTextContent('Guardia');
    // The guard's navigation replaces the resident's.
    expect(
      screen.getAllByRole('link', { name: 'Libro de guardia' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Cuenta' })).toBeNull();
  });

  it('closes the context list with Escape', () => {
    renderWithShell(<AppShell>x</AppShell>, MEMBER);
    const banner = screen.getByRole('banner');
    fireEvent.click(
      within(banner).getByRole('button', { name: /Cambiar de contexto/ }),
    );
    expect(
      within(banner).getByRole('group', { name: 'Cambiar de contexto' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      within(banner).queryByRole('group', { name: 'Cambiar de contexto' }),
    ).toBeNull();
  });

  it('closes the context list when pressing outside', () => {
    renderWithShell(<AppShell>x</AppShell>, GUARD);
    const banner = screen.getByRole('banner');
    fireEvent.click(
      within(banner).getByRole('button', { name: /Cambiar de contexto/ }),
    );
    fireEvent.pointerDown(document.body);
    expect(
      within(banner).queryByRole('group', { name: 'Cambiar de contexto' }),
    ).toBeNull();
  });

  it('opens the appearance menu with theme and gate controls', () => {
    renderWithShell(<AppShell>x</AppShell>, HOLDER);
    fireEvent.click(screen.getByRole('button', { name: 'Apariencia' }));
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Modo garita' }),
    ).toBeInTheDocument();
  });
});

describe('ActiveContextProvider', () => {
  function Probe() {
    const { active, contexts, switchContext } = useActiveContext();
    return (
      <>
        <p data-testid="active">{active.membership_id}</p>
        <p data-testid="count">{contexts.length}</p>
        <button type="button" onClick={() => switchContext('missing')}>
          unknown
        </button>
        <button type="button" onClick={() => switchContext(GUARD)}>
          guard
        </button>
      </>
    );
  }

  it('falls back to the first context for an unknown initial id and ignores unknown switches', () => {
    renderWithShell(<Probe />, 'does-not-exist');
    expect(screen.getByTestId('active')).toHaveTextContent(HOLDER);
    fireEvent.click(screen.getByRole('button', { name: 'unknown' }));
    expect(screen.getByTestId('active')).toHaveTextContent(HOLDER);
    fireEvent.click(screen.getByRole('button', { name: 'guard' }));
    expect(screen.getByTestId('active')).toHaveTextContent(GUARD);
    expect(screen.getByTestId('count')).toHaveTextContent(
      String(MOCK_CONTEXTS.length),
    );
  });
});
