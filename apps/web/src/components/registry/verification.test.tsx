import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { OnboardingCard } from './onboarding-card';
import { VerificationLists } from './verification-lists';

const actions = vi.hoisted(() => ({
  decideJoinRequestAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
  rotateJoinCodeAction: vi.fn(),
  resolvePersonClaimAction: vi.fn(),
  resolveVehicleClaimAction: vi.fn(),
}));
vi.mock('@/app/(app)/registry/units/actions', () => actions);
vi.mock('@/app/(app)/registry/verification/actions', () => actions);

const success = (notice: string) => ({ status: 'success' as const, notice });
const failure = (formError: string) => ({
  status: 'error' as const,
  errors: {},
  formError,
});

beforeEach(() => vi.clearAllMocks());

describe('identity conflict on a join request', () => {
  it('says the request needs review, keeps it listed and links to the verification list', async () => {
    actions.decideJoinRequestAction.mockResolvedValue(
      failure('identityConflict'),
    );
    renderWithIntl(
      <OnboardingCard
        unitId="u1"
        writable
        timeZone="America/Argentina/Tucuman"
        invitations={[] as never}
        requests={
          [
            {
              unit_join_request_id: 'q1',
              unit_join_request_first_name: 'Raúl',
              unit_join_request_last_name: 'Solicitante',
              unit_join_request_email: 'raul@x.com',
              unit_join_request_document_number: '999',
            },
          ] as never
        }
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Aprobar a Raúl Solicitante' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Conflicto de identidad: requiere revisión',
    );
    expect(
      within(alert).getByRole('link', {
        name: 'Ver pendientes de verificación',
      }),
    ).toHaveAttribute('href', '/registry/verification');
    // The request is still there to decide later.
    expect(
      screen.getByRole('button', { name: 'Aprobar a Raúl Solicitante' }),
    ).toBeInTheDocument();
  });
});

const pendingPerson = (overrides = {}) => ({
  person_id: 'p1',
  person_first_name: 'Ana',
  person_last_name: 'Gómez',
  registered: {
    documentType: 'dni',
    documentNumber: '111',
    email: 'ana@x.com',
  },
  declared: { documentType: 'dni', documentNumber: '222', email: null },
  unit: { unit_id: 'u1', unit_code: 'Mz 1' },
  holders: [
    {
      person_id: 'p9',
      name: 'Beto Ruiz',
      units: [{ unit_id: 'u2', unit_code: 'Mz 2' }],
    },
  ],
  ...overrides,
});
const pendingVehicle = (overrides = {}) => ({
  vehicle_id: 'v1',
  vehicle_plate_code: 'AB123CD',
  vehicle_make_name: 'Fiat',
  vehicle_model_name: 'Uno',
  vehicle_color_name: null,
  unit: { unit_id: 'u1', unit_code: 'Mz 1' },
  holders: [{ vehicle_id: 'v9', unit: { unit_id: 'u3', unit_code: 'Mz 3' } }],
  ...overrides,
});

describe('VerificationLists', () => {
  it('shows registered against declared data, who already holds it, and where to look', () => {
    renderWithIntl(
      <VerificationLists
        people={[pendingPerson()]}
        vehicles={[pendingVehicle()]}
        writable
      />,
    );
    const people = screen.getByRole('list', { name: 'Personas' });
    expect(people).toHaveTextContent('Ana Gómez');
    expect(people).toHaveTextContent('DNI 111 · ana@x.com');
    expect(people).toHaveTextContent('DNI 222');
    expect(within(people).getByRole('link', { name: 'Mz 2' })).toHaveAttribute(
      'href',
      '/registry/units/u2',
    );
    expect(within(people).getByText('Beto Ruiz')).toBeInTheDocument();
    const vehicles = screen.getByRole('list', { name: 'Vehículos' });
    expect(vehicles).toHaveTextContent('AB123CD');
    expect(
      within(vehicles).getByRole('link', { name: 'Mz 3' }),
    ).toHaveAttribute('href', '/registry/units/u3');
  });

  it('resolves a person either way and shows the database refusal in words', async () => {
    actions.resolvePersonClaimAction.mockResolvedValueOnce(
      failure('identityTaken'),
    );
    actions.resolvePersonClaimAction.mockResolvedValueOnce(
      success('claimDiscarded'),
    );
    renderWithIntl(
      <VerificationLists people={[pendingPerson()]} vehicles={[]} writable />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Usar los datos declarados de Ana Gómez',
      }),
    );
    expect(actions.resolvePersonClaimAction).toHaveBeenCalledWith(
      'p1',
      'declared',
    );
    expect(
      await screen.findByText(/Otra persona ya tiene ese documento o email/),
    ).toBeInTheDocument();
    const keep = screen.getByRole('button', {
      name: 'Conservar los datos registrados de Ana Gómez',
    });
    // The previous call is still settling: buttons are disabled until it ends.
    await waitFor(() => expect(keep).toBeEnabled());
    fireEvent.click(keep);
    expect(actions.resolvePersonClaimAction).toHaveBeenLastCalledWith(
      'p1',
      'registered',
    );
    expect(
      await screen.findByText('Se conservaron los datos registrados.'),
    ).toBeInTheDocument();
  });

  it('cannot resolve a person without a residence', () => {
    renderWithIntl(
      <VerificationLists
        people={[pendingPerson({ unit: null })]}
        vehicles={[]}
        writable
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'Usar los datos declarados de Ana Gómez',
      }),
    ).toBeDisabled();
  });

  it('verifies or discards a plate claim', async () => {
    actions.resolveVehicleClaimAction.mockResolvedValueOnce(
      failure('plateHeld'),
    );
    actions.resolveVehicleClaimAction.mockResolvedValueOnce(
      success('plateDiscarded'),
    );
    renderWithIntl(
      <VerificationLists people={[]} vehicles={[pendingVehicle()]} writable />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Verificar la patente AB123CD' }),
    );
    expect(actions.resolveVehicleClaimAction).toHaveBeenCalledWith(
      'v1',
      'verify',
    );
    expect(
      await screen.findByText(/Otro vehículo verificado ya tiene esa patente/),
    ).toBeInTheDocument();
    const discard = screen.getByRole('button', {
      name: 'Descartar el reclamo de la patente AB123CD',
    });
    await waitFor(() => expect(discard).toBeEnabled());
    fireEvent.click(discard);
    expect(actions.resolveVehicleClaimAction).toHaveBeenLastCalledWith(
      'v1',
      'discard',
    );
    expect(await screen.findByText('Reclamo descartado.')).toBeInTheDocument();
  });

  it('says when nothing is pending, and offers no actions when read-only', () => {
    const { unmount } = renderWithIntl(
      <VerificationLists people={[]} vehicles={[]} writable />,
    );
    expect(screen.getByText('No hay personas pendientes.')).toBeInTheDocument();
    expect(
      screen.getByText('No hay vehículos pendientes.'),
    ).toBeInTheDocument();
    unmount();
    renderWithIntl(
      <VerificationLists
        people={[pendingPerson()]}
        vehicles={[pendingVehicle()]}
        writable={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Usar los datos|Verificar/ }),
    ).toBeNull();
  });
});
