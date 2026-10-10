import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeFormState } from '@/lib/auth/mfa-state';
import { renderWithIntl } from '@/test/render';

const verify =
  vi.fn<(previous: CodeFormState, data: FormData) => Promise<CodeFormState>>();
vi.mock('@/app/(auth)/login/mfa/actions', () => ({
  verifyMfaChallengeAction: (previous: CodeFormState, data: FormData) =>
    verify(previous, data),
}));

const { MfaChallengeForm } = await import('./mfa-challenge-form');

const ONE = [
  { id: 'factor-1', name: 'App 1', createdAt: '2026-10-10T12:00:00Z' },
];
const TWO = [
  ...ONE,
  { id: 'factor-2', name: 'App 2', createdAt: '2026-10-11T12:00:00Z' },
];

beforeEach(() => {
  verify.mockReset();
  verify.mockResolvedValue({ status: 'idle' });
});

async function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
}

describe('MfaChallengeForm', () => {
  it('has a labelled one-time-code field and a single primary action', () => {
    renderWithIntl(<MfaChallengeForm factors={ONE} next="/platform" />);
    const input = screen.getByLabelText('Código de 6 dígitos');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getAllByRole('button')).toHaveLength(1);
    // One factor: nothing to choose.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('sends the code, the factor and the return path to the server action', async () => {
    renderWithIntl(<MfaChallengeForm factors={ONE} next="/platform" />);
    await submitCode('123456');
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    const data = verify.mock.calls[0]?.[1];
    expect(data?.get('code')).toBe('123456');
    expect(data?.get('factorId')).toBe('factor-1');
    expect(data?.get('next')).toBe('/platform');
  });

  it('lets the user pick which factor they are answering when there are several', async () => {
    renderWithIntl(<MfaChallengeForm factors={TWO} next="/" />);
    fireEvent.change(screen.getByLabelText('Método'), {
      target: { value: 'factor-2' },
    });
    await submitCode('654321');
    await waitFor(() => expect(verify).toHaveBeenCalled());
    expect(verify.mock.calls[0]?.[1].get('factorId')).toBe('factor-2');
  });

  it.each([
    [
      { status: 'error', error: 'mfaWrongCode', field: 'code' },
      'El código no es correcto o ya venció. Esperá el siguiente en tu app y volvé a intentar.',
    ],
    [
      { status: 'error', error: 'mfaCodeInvalid', field: 'code' },
      'Escribí los 6 dígitos que muestra tu app de autenticación.',
    ],
    [
      { status: 'error', error: 'rateLimit', field: 'form' },
      'Hiciste demasiados intentos en poco tiempo. Esperá unos minutos y volvé a intentar.',
    ],
  ] as const)('shows the es-AR error for %j', async (result, message) => {
    verify.mockResolvedValue(result);
    renderWithIntl(<MfaChallengeForm factors={ONE} next="/" />);
    await submitCode('000000');
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('marks the code field invalid when the error belongs to it', async () => {
    verify.mockResolvedValue({
      status: 'error',
      error: 'mfaWrongCode',
      field: 'code',
    });
    renderWithIntl(<MfaChallengeForm factors={ONE} next="/" />);
    await submitCode('000000');
    await waitFor(() =>
      expect(screen.getByLabelText('Código de 6 dígitos')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
  });
});
