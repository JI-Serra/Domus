import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvitationActionState } from '@/app/(auth)/invitations/accept/actions';
import { renderWithIntl } from '@/test/render';

const accept =
  vi.fn<
    (
      previous: InvitationActionState,
      data: FormData,
    ) => Promise<InvitationActionState>
  >();
const establish =
  vi.fn<
    (access: string, refresh: string, token: string) => Promise<{ ok: false }>
  >();
vi.mock('@/app/(auth)/invitations/accept/actions', () => ({
  acceptInvitationAction: (previous: InvitationActionState, data: FormData) =>
    accept(previous, data),
  establishInvitationSessionAction: (
    access: string,
    refresh: string,
    token: string,
  ) => establish(access, refresh, token),
}));

const { AcceptInvitationForm } = await import('./accept-form');
const { InvitationSessionGate } = await import('./session-gate');

const TOKEN = 'a'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  accept.mockResolvedValue({ status: 'idle' });
  window.history.replaceState(null, '', '/invitations/accept');
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('AcceptInvitationForm', () => {
  it('shows the barrio and the role before accepting, with the password behind an info button', () => {
    renderWithIntl(
      <AcceptInvitationForm
        token={TOKEN}
        tenantName="Los Ceibos"
        roleLabel="Administrador"
      />,
    );
    expect(screen.getByText('Los Ceibos')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña (opcional)')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre la contraseña',
      }),
    );
    expect(screen.getByText(/Al menos 8 caracteres/)).toBeInTheDocument();
  });

  it('submits the token without a password when none is typed', async () => {
    renderWithIntl(
      <AcceptInvitationForm
        token={TOKEN}
        tenantName="Los Ceibos"
        roleLabel="Administrador"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    await waitFor(() => expect(accept).toHaveBeenCalled());
    const data = accept.mock.calls[0]?.[1];
    expect(data?.get('token')).toBe(TOKEN);
    expect(data?.get('password')).toBe('');
  });

  it('shows the uniform unavailable error', async () => {
    accept.mockResolvedValue({
      status: 'error',
      error: 'unavailable',
      scope: 'invitation',
      field: 'form',
    });
    renderWithIntl(
      <AcceptInvitationForm token={TOKEN} tenantName="X" roleLabel="Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    expect(
      await screen.findByText(/Esta invitación no está disponible/),
    ).toBeInTheDocument();
  });

  it('shows password problems on their field, in Spanish', async () => {
    accept.mockResolvedValue({
      status: 'error',
      error: 'passwordMismatch',
      scope: 'auth',
      field: 'confirmPassword',
    });
    renderWithIntl(
      <AcceptInvitationForm token={TOKEN} tenantName="X" roleLabel="Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    expect(
      await screen.findByText(
        'Las contraseñas no coinciden. Escribilas de nuevo.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to a generic message for an unknown error key', async () => {
    accept.mockResolvedValue({
      status: 'error',
      error: 'surprise',
      scope: 'invitation',
      field: 'form',
    });
    renderWithIntl(
      <AcceptInvitationForm token={TOKEN} tenantName="X" roleLabel="Y" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar invitación' }));
    expect(await screen.findByText(/Algo salió mal/)).toBeInTheDocument();
  });
});

describe('InvitationSessionGate', () => {
  const page = <p>contenido de la invitación</p>;

  it('shows the page as is when the URL has no session fragment', () => {
    renderWithIntl(
      <InvitationSessionGate token={TOKEN}>{page}</InvitationSessionGate>,
    );
    expect(screen.getByText('contenido de la invitación')).toBeInTheDocument();
    expect(establish).not.toHaveBeenCalled();
  });

  it('hands the session in the fragment to the server and shows progress meanwhile', async () => {
    window.history.replaceState(
      null,
      '',
      '/invitations/accept#access_token=acc&refresh_token=ref&type=invite',
    );
    establish.mockReturnValue(new Promise(() => {}));
    renderWithIntl(
      <InvitationSessionGate token={TOKEN}>{page}</InvitationSessionGate>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Verificando tu invitación…',
    );
    expect(screen.queryByText('contenido de la invitación')).toBeNull();
    await waitFor(() =>
      expect(establish).toHaveBeenCalledWith('acc', 'ref', TOKEN),
    );
  });

  it('shows the expired-link message when the server refuses the session, and drops the fragment', async () => {
    window.history.replaceState(
      null,
      '',
      '/invitations/accept#access_token=acc&refresh_token=ref',
    );
    establish.mockResolvedValue({ ok: false });
    renderWithIntl(
      <InvitationSessionGate token={TOKEN}>{page}</InvitationSessionGate>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace venció. Pedí una invitación nueva a quien te invitó.',
    );
    expect(window.location.hash).toBe('');
  });

  it('shows the expired-link message when the auth server left an error in the fragment', async () => {
    window.history.replaceState(
      null,
      '',
      '/invitations/accept#error=access_denied&error_code=otp_expired',
    );
    renderWithIntl(
      <InvitationSessionGate token={TOKEN}>{page}</InvitationSessionGate>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El enlace venció',
    );
    expect(establish).not.toHaveBeenCalled();
  });

  it('reacts to the fragment changing', async () => {
    renderWithIntl(
      <InvitationSessionGate token={TOKEN}>{page}</InvitationSessionGate>,
    );
    establish.mockReturnValue(new Promise(() => {}));
    act(() => {
      window.history.replaceState(
        null,
        '',
        '/invitations/accept#access_token=a2&refresh_token=r2',
      );
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() =>
      expect(establish).toHaveBeenCalledWith('a2', 'r2', TOKEN),
    );
  });
});
