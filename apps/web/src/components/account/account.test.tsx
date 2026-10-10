import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CodeFormState,
  EnrollmentStart,
  FactorRemoval,
} from '@/lib/auth/mfa-state';
import { renderWithIntl } from '@/test/render';

const start = vi.fn<() => Promise<EnrollmentStart>>();
const cancel = vi.fn<(factorId: string) => Promise<void>>();
const verify =
  vi.fn<(previous: CodeFormState, data: FormData) => Promise<CodeFormState>>();
const remove = vi.fn<(factorId: string) => Promise<FactorRemoval>>();
vi.mock('@/app/(account)/account/security/actions', () => ({
  startTotpEnrollmentAction: () => start(),
  cancelTotpEnrollmentAction: (id: string) => cancel(id),
  verifyTotpEnrollmentAction: (previous: CodeFormState, data: FormData) =>
    verify(previous, data),
  removeFactorAction: (id: string) => remove(id),
}));

const { TotpEnrollment } = await import('./totp-enrollment');
const { FactorList } = await import('./factor-list');
const { MfaRecommendation } = await import('./mfa-recommendation');

const STARTED: EnrollmentStart = {
  ok: true,
  factorId: 'factor-new',
  qrCode: 'data:image/svg+xml;utf-8,<svg/>',
  secret: 'JBSWY3DPEHPK3PXP',
};

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue({ status: 'idle' });
  cancel.mockResolvedValue();
  window.localStorage.clear();
});

describe('TotpEnrollment', () => {
  it('starts with a single primary action', () => {
    renderWithIntl(<TotpEnrollment hasFactor={false} next="" />);
    expect(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('offers to add another method when one is already enrolled', () => {
    renderWithIntl(<TotpEnrollment hasFactor next="" />);
    expect(
      screen.getByRole('button', { name: 'Agregar otro método' }),
    ).toBeInTheDocument();
  });

  it('shows the QR and the manual key, with the help behind an info button', async () => {
    start.mockResolvedValue(STARTED);
    renderWithIntl(<TotpEnrollment hasFactor={false} next="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    );

    const qr = await screen.findByRole('img', {
      name: 'Código QR para agregar Domus a tu app de autenticación',
    });
    expect(qr).toHaveAttribute('src', STARTED.ok ? STARTED.qrCode : '');
    expect(screen.getByLabelText('Clave manual')).toHaveValue(
      'JBSWY3DPEHPK3PXP',
    );
    expect(screen.getByLabelText('Clave manual')).toHaveAttribute('readonly');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre la clave manual',
      }),
    );
    expect(
      screen.getByText(/escribí esta clave en tu app de autenticación/),
    ).toBeInTheDocument();
  });

  it('verifies the first code with the factor and the return path, then confirms', async () => {
    start.mockResolvedValue(STARTED);
    verify.mockResolvedValue({ status: 'done' });
    renderWithIntl(<TotpEnrollment hasFactor={false} next="/platform" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    );
    await screen.findByLabelText('Código de 6 dígitos');
    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), {
      target: { value: '123456' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Verificar y activar' }),
    );

    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    const data = verify.mock.calls[0]?.[1];
    expect(data?.get('code')).toBe('123456');
    expect(data?.get('factorId')).toBe('factor-new');
    expect(data?.get('next')).toBe('/platform');
    expect(
      await screen.findByText('Verificación en dos pasos activada.'),
    ).toBeInTheDocument();
  });

  it('shows the error of a wrong code and keeps the flow open', async () => {
    start.mockResolvedValue(STARTED);
    verify.mockResolvedValue({
      status: 'error',
      error: 'mfaWrongCode',
      field: 'code',
    });
    renderWithIntl(<TotpEnrollment hasFactor={false} next="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    );
    await screen.findByLabelText('Código de 6 dígitos');
    fireEvent.click(
      screen.getByRole('button', { name: 'Verificar y activar' }),
    );
    expect(
      await screen.findByText(/El código no es correcto o ya venció/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Código de 6 dígitos')).toBeInTheDocument();
  });

  it('discards the half-finished factor when the user cancels', async () => {
    start.mockResolvedValue(STARTED);
    renderWithIntl(<TotpEnrollment hasFactor={false} next="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    );
    await screen.findByLabelText('Código de 6 dígitos');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancel).toHaveBeenCalledWith('factor-new');
    expect(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    ).toBeInTheDocument();
  });

  it('reports a start failure in Spanish', async () => {
    start.mockResolvedValue({ ok: false, error: 'mfaUnavailable' });
    renderWithIntl(<TotpEnrollment hasFactor={false} next="" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Activar verificación en dos pasos' }),
    );
    expect(
      await screen.findByText(/no está disponible por ahora/),
    ).toBeInTheDocument();
  });
});

const FACTORS = [
  {
    id: 'f1',
    name: 'App de autenticación abc',
    createdAt: '2026-10-10T15:00:00Z',
  },
];

describe('FactorList', () => {
  it('says so when there are no factors', () => {
    renderWithIntl(<FactorList factors={[]} />);
    expect(
      screen.getByText('Todavía no agregaste ninguno.'),
    ).toBeInTheDocument();
  });

  it('lists the factor with its date in es-AR format', () => {
    renderWithIntl(<FactorList factors={FACTORS} />);
    expect(screen.getByText('App de autenticación abc')).toBeInTheDocument();
    expect(screen.getByText('Agregado el 10/10/2026')).toBeInTheDocument();
  });

  it('asks for confirmation before removing, and removes only after it', async () => {
    remove.mockResolvedValue({ ok: true });
    renderWithIntl(<FactorList factors={FACTORS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(remove).not.toHaveBeenCalled();

    const group = screen.getByRole('group', { name: '¿Quitar este método?' });
    fireEvent.click(within(group).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('f1'));
  });

  it('keeps the factor when the user backs out', () => {
    renderWithIntl(<FactorList factors={FACTORS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
  });

  it('offers the challenge when removing needs aal2 (the auth server refused)', async () => {
    remove.mockResolvedValue({ ok: false, error: 'mfaReauthRequired' });
    renderWithIntl(<FactorList factors={FACTORS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    const group = screen.getByRole('group', { name: '¿Quitar este método?' });
    fireEvent.click(within(group).getByRole('button', { name: 'Quitar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('confirmá tu identidad');
    expect(
      within(alert).getByRole('link', { name: 'Confirmar mi identidad' }),
    ).toHaveAttribute(
      'href',
      `/login/mfa?next=${encodeURIComponent('/account/security')}`,
    );
  });
});

describe('MfaRecommendation', () => {
  it('recommends two-step verification, with the reason behind an info button', () => {
    renderWithIntl(<MfaRecommendation />);
    expect(
      screen.getByText(
        'Protegé tu cuenta de administrador con la verificación en dos pasos',
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre la recomendación',
      }),
    );
    expect(
      screen.getByText(/una contraseña robada no alcanza/),
    ).toBeInTheDocument();
  });

  it('can be dismissed, and stays dismissed in this browser', () => {
    const first = renderWithIntl(<MfaRecommendation />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Descartar recomendación' }),
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(
      window.localStorage.getItem('domus.mfa-recommendation-dismissed'),
    ).toBe('1');
    first.unmount();

    renderWithIntl(<MfaRecommendation />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('still shows (and dismisses for the session) when storage is blocked', () => {
    const blocked = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    renderWithIntl(<MfaRecommendation />);
    expect(screen.getByRole('region')).toBeInTheDocument();
    blocked.mockRestore();
  });
});
