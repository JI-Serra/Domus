import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '@/components/shell/top-bar';
import { renderWithShell } from '@/test/render';

const endSupport = vi.fn<(sessionId?: string) => Promise<void>>();
vi.mock('@/lib/support/actions', () => ({
  endSupportAction: (sessionId?: string) => endSupport(sessionId),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const { SupportBanner } = await import('./support-banner');
const { SupportSessionProvider } = await import('./support-session');

const NOW = new Date('2026-10-10T12:00:00Z');
const session = (overrides: Partial<{ expiresAt: string }> = {}) => ({
  sessionId: '00000000-0000-4000-8000-0000000000aa',
  targetName: 'Marta Soporte',
  tenantName: 'Los Ceibos',
  expiresAt: '2026-10-10T12:30:00Z',
  serverNow: NOW.toISOString(),
  ...overrides,
});

function renderBanner(value: ReturnType<typeof session> | null) {
  return renderWithShell(
    <SupportSessionProvider value={value}>
      <SupportBanner />
    </SupportSessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: NOW });
  endSupport.mockResolvedValue();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SupportBanner', () => {
  it('renders nothing when nobody is being impersonated', () => {
    renderBanner(null);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('says who the admin is acting as, the barrio and the time left, with the way out', () => {
    renderBanner(session());
    const banner = screen.getByRole('region', { name: 'Sesión de soporte' });
    expect(banner).toHaveTextContent(
      'Soporte: estás viendo Domus como Marta Soporte',
    );
    expect(banner).toHaveTextContent('Los Ceibos');
    expect(within(banner).getByRole('timer')).toHaveTextContent('Quedan 30:00');
    expect(
      within(banner).getByRole('button', { name: 'Terminar' }),
    ).toBeEnabled();
  });

  it('counts down every second', () => {
    renderBanner(session());
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('Quedan 28:55');
  });

  it('falls back to a neutral name when the target name is unknown', () => {
    renderBanner({ ...session(), targetName: '' });
    expect(screen.getByRole('region')).toHaveTextContent('como un usuario');
  });

  it('ends the session from the button, once', async () => {
    renderBanner(session());
    const end = screen.getByRole('button', { name: 'Terminar' });
    fireEvent.click(end);
    fireEvent.click(end);
    await act(async () => {
      await Promise.resolve();
    });
    expect(endSupport).toHaveBeenCalledTimes(1);
    expect(endSupport).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-0000000000aa',
    );
  });

  it('ends the session by itself when the countdown reaches zero', async () => {
    renderBanner(session({ expiresAt: '2026-10-10T12:00:03Z' }));
    expect(endSupport).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('Quedan 00:00');
    expect(endSupport).toHaveBeenCalledTimes(1);
  });

  it('is already ending when a page opens after the expiry', async () => {
    renderBanner(session({ expiresAt: '2026-10-10T11:59:00Z' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(endSupport).toHaveBeenCalledTimes(1);
  });
});

describe('top bar during a support session', () => {
  it('offers account security and sign-out normally', () => {
    renderWithShell(<TopBar />);
    expect(
      screen.getByRole('link', { name: 'Seguridad de la cuenta' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeInTheDocument();
  });

  it('hides both while acting as somebody else', () => {
    renderWithShell(
      <SupportSessionProvider value={session()}>
        <TopBar />
      </SupportSessionProvider>,
    );
    expect(
      screen.queryByRole('link', { name: 'Seguridad de la cuenta' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).toBeNull();
  });
});
