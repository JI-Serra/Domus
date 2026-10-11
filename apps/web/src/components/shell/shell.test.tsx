import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithShell } from '@/test/render';
import { useActiveContext } from './active-context';
import { AppShell } from './app-shell';
import { MOCK_CONTEXTS } from '@/test/fixtures';
import {
  getHomeHref,
  getNavItemBySlug,
  getNavigation,
  getPlaceholderSlugs,
  getTabBarItems,
  isNavItemActive,
} from './navigation';
import type { MembershipRole } from './active-context';

let pathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

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
    '%s has a way in and a tab bar of 2 to 5 destinations',
    (role) => {
      // Platform admins have no tenant home: their area starts at /platform.
      expect(getNavigation(role)[0]?.href).toBe(
        role === 'platform_admin' ? '/platform/tenants' : '/',
      );
      const tabs = getTabBarItems(role);
      expect(tabs.length).toBeGreaterThanOrEqual(2);
      expect(tabs.length).toBeLessThanOrEqual(5);
    },
  );

  it('gives residents Inicio · Mi hogar · Accesos · Barrio · Cuenta', () => {
    for (const role of ['unit_holder', 'household_member'] as const)
      expect(getTabBarItems(role).map((entry) => entry.id)).toEqual([
        'home',
        'household',
        'access',
        'neighborhood',
        'account',
      ]);
  });

  it('does not pre-render a placeholder where Mi hogar has its own page', () => {
    expect(getPlaceholderSlugs()).not.toContain('home');
    expect(getNavItemBySlug('home')?.id).toBe('household');
  });

  it('keeps settings out of the admin tab bar but in the sidebar', () => {
    expect(
      getNavigation('tenant_admin').some((entry) => entry.id === 'settings'),
    ).toBe(true);
    expect(
      getTabBarItems('tenant_admin').some((entry) => entry.id === 'settings'),
    ).toBe(false);
  });

  it('gives platform admins their own navigation: Barrios and Soporte', () => {
    expect(getNavigation('platform_admin').map((entry) => entry.href)).toEqual([
      '/platform/tenants',
      '/platform/support',
    ]);
    expect(getHomeHref('platform_admin')).toBe('/platform');
    expect(getHomeHref('guard')).toBe('/');
  });

  it('resolves placeholder slugs (tenant area only)', () => {
    expect(getPlaceholderSlugs()).toContain('guard-log');
    expect(getPlaceholderSlugs().every((slug) => !slug.includes('/'))).toBe(
      true,
    );
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

describe('suspended tenant banner (M01-F02)', () => {
  it('shows a compact persistent notice with the details behind an info button', () => {
    renderWithShell(<AppShell>x</AppShell>, ADMIN, {
      tenantStatus: 'suspended',
    });
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Barrio suspendido · solo lectura');
    fireEvent.click(
      within(notice).getByRole('button', {
        name: 'Más información sobre el barrio suspendido',
      }),
    );
    expect(notice).toHaveTextContent('La garita sigue validando los accesos');
  });

  it.each(['pilot', 'active', null] as const)(
    'stays out of the way when the tenant status is %s',
    (tenantStatus) => {
      renderWithShell(<AppShell>x</AppShell>, ADMIN, { tenantStatus });
      expect(screen.queryByRole('status')).toBeNull();
    },
  );
});

describe('platform option locked behind MFA', () => {
  it.each([
    ['challenge', 'Verificá tu identidad para entrar', '/login/mfa'],
    [
      'enroll',
      'Activá la verificación en dos pasos para entrar',
      '/account/security',
    ],
  ] as const)(
    'offers the %s step instead of hiding "Plataforma"',
    (platformMfaStep, text, path) => {
      renderWithShell(<AppShell>x</AppShell>, ADMIN, { platformMfaStep });
      const banner = screen.getByRole('banner');
      fireEvent.click(
        within(banner).getByRole('button', { name: /Cambiar de contexto/ }),
      );
      const offer = within(banner).getByRole('link', { name: /Plataforma/ });
      expect(offer).toHaveTextContent(text);
      expect(offer.getAttribute('href')).toBe(
        `${path}?next=${encodeURIComponent('/platform')}`,
      );
    },
  );

  it('does not add the option when there is nothing to unlock', () => {
    renderWithShell(<AppShell>x</AppShell>, ADMIN);
    fireEvent.click(
      screen.getByRole('button', { name: /Cambiar de contexto/ }),
    );
    expect(screen.queryByRole('link', { name: /Plataforma/ })).toBeNull();
  });

  it('a single-context platform admin below aal2 still gets the switcher with the offer', () => {
    const [only] = MOCK_CONTEXTS;
    if (!only) throw new Error('fixture missing');
    renderWithShell(<AppShell>x</AppShell>, only.membership_id, {
      contexts: [only],
      platformMfaStep: 'challenge',
    });
    expect(
      screen.getByRole('button', { name: /Cambiar de contexto/ }),
    ).toBeInTheDocument();
  });
});

describe('top bar', () => {
  it('links to the account security page from every role', () => {
    renderWithShell(<AppShell>x</AppShell>, GUARD);
    expect(
      screen.getByRole('link', { name: 'Seguridad de la cuenta' }),
    ).toHaveAttribute('href', '/account/security');
  });

  it('carries the Domus emblem below the sidebar breakpoint, and the sidebar the logo', () => {
    renderWithShell(<AppShell>x</AppShell>, HOLDER);
    expect(screen.getAllByRole('img', { name: 'Domus' })).toHaveLength(2);
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
