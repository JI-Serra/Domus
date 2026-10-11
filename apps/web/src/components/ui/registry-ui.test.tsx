import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { CopyTextButton } from './copy-text-button';
import { Countdown, useCountdown } from './countdown';
import { OneTimeSecret } from './one-time-secret';
import { Pagination } from './pagination';
import { SubNav } from './sub-nav';

let pathname = '/registry/units';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

describe('CopyTextButton', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('copies, says so, and goes back to its label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <CopyTextButton text="ABCD-EFGH" label="Copiar" copiedLabel="Copiado" />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Copiado');
    act(() => void vi.advanceTimersByTime(3000));
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
  });

  it('stays as it was when the clipboard is not available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    render(<CopyTextButton text="x" label="Copiar" copiedLabel="Copiado" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    });
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument();
  });
});

describe('OneTimeSecret', () => {
  it('shows the value large, with a copy button and the warning behind an info button', () => {
    renderWithIntl(
      <OneTimeSecret
        label="Código de la unidad"
        value="ABCD-EFGH-JKLM"
        copyLabel="Copiar código"
        copiedLabel="Copiado"
        info={{
          label: 'Más información sobre el código',
          text: 'Se muestra una sola vez.',
        }}
      >
        <span>extra</span>
      </OneTimeSecret>,
    );
    expect(screen.getByTestId('one-time-secret')).toHaveTextContent(
      'ABCD-EFGH-JKLM',
    );
    expect(
      screen.getByRole('button', { name: 'Copiar código' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Se muestra una sola vez.')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Más información sobre el código' }),
    );
    expect(screen.getByText('Se muestra una sola vez.')).toBeInTheDocument();
    expect(screen.getByText('extra')).toBeInTheDocument();
  });
});

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') }));
  afterEach(() => vi.useRealTimers());

  it('counts down every second and announces the end', () => {
    render(
      <Countdown
        expiresAt="2026-10-10T12:10:00Z"
        label="Vence en"
        expiredLabel="Venció"
      />,
    );
    expect(screen.getByTestId('countdown')).toHaveTextContent('10:00');
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('countdown')).toHaveTextContent('9:55');
    act(() => void vi.advanceTimersByTime(10 * 60 * 1000));
    expect(screen.getByTestId('countdown')).toHaveTextContent('Venció');
    expect(screen.getByRole('status')).toHaveTextContent('Venció');
  });

  it('corrects itself against the clock (a sleeping tab)', () => {
    function Probe() {
      return (
        <p data-testid="seconds">{useCountdown('2026-10-10T12:01:00Z')}</p>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId('seconds')).toHaveTextContent('60');
    vi.setSystemTime(new Date('2026-10-10T12:00:50Z'));
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('seconds')).toHaveTextContent('9');
  });
});

describe('Pagination', () => {
  const props = {
    pageSize: 25,
    total: 60,
    hrefFor: (page: number) => `/x?page=${page}`,
    previousLabel: 'Anterior',
    nextLabel: 'Siguiente',
  };

  it('links to the neighbours and says where you are', () => {
    render(<Pagination {...props} page={2} summary="Página 2 de 3" />);
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/x?page=1',
    );
    expect(screen.getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/x?page=3',
    );
    expect(screen.getAllByText('Página 2 de 3').length).toBeGreaterThan(0);
  });

  it('has no previous link on the first page, no next on the last, and nothing for a single page', () => {
    const { rerender } = render(<Pagination {...props} page={1} summary="s" />);
    expect(screen.queryByRole('link', { name: 'Anterior' })).toBeNull();
    rerender(<Pagination {...props} page={3} summary="s" />);
    expect(screen.queryByRole('link', { name: 'Siguiente' })).toBeNull();
    rerender(<Pagination {...props} total={10} page={1} summary="s" />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('SubNav', () => {
  it('marks the current destination, including its sub-pages', () => {
    pathname = '/registry/units/abc';
    render(
      <SubNav
        label="Padrón"
        items={[
          { href: '/registry/units', label: 'Unidades' },
          { href: '/registry/import', label: 'Importar' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Unidades' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Importar' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
