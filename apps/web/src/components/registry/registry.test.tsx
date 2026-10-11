import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { GatesPanel } from './gates-panel';
import { GuardsList } from './guards-list';
import { ImportWizard } from './import-wizard';
import { OnboardingCard } from './onboarding-card';
import { PairDeviceForm } from './pair-device-form';
import { ResidentsCard } from './residents-card';
import { UnitForm } from './unit-form';
import { UnitStatusBadge } from './unit-status-badge';

const actions = vi.hoisted(() => ({
  endResidenceAction: vi.fn(),
  saveResidentAction: vi.fn(),
  inviteResidentAction: vi.fn(),
  decideJoinRequestAction: vi.fn(),
  revokeInvitationAction: vi.fn(),
  rotateJoinCodeAction: vi.fn(),
  assignGuardGateAction: vi.fn(),
  deactivateGuardAction: vi.fn(),
  revokeGuardInvitationAction: vi.fn(),
  inviteGuardAction: vi.fn(),
  createPairingAction: vi.fn(),
  revokeDeviceAction: vi.fn(),
  saveGateAction: vi.fn(),
  redeemPairingAction: vi.fn(),
  stageImportAction: vi.fn(),
  confirmImportAction: vi.fn(),
  saveVehicleAction: vi.fn(),
  archiveVehicleAction: vi.fn(),
  savePetAction: vi.fn(),
  archivePetAction: vi.fn(),
  archiveUnitAction: vi.fn(),
  saveUnitAction: vi.fn(),
}));
vi.mock('@/app/(app)/registry/units/actions', () => actions);
vi.mock('@/app/(app)/registry/guards/actions', () => actions);
vi.mock('@/app/(app)/registry/gates/actions', () => actions);
vi.mock('@/app/(app)/registry/import/actions', () => actions);
vi.mock('@/app/(app)/devices/pair/actions', () => actions);
vi.mock('next/navigation', () => ({
  usePathname: () => '/registry/units',
  useRouter: () => ({ push: vi.fn() }),
}));

const success = (notice?: string, value?: string) => ({
  status: 'success' as const,
  ...(notice ? { notice } : {}),
  ...(value ? { value } : {}),
});
const failure = (formError: string) => ({
  status: 'error' as const,
  errors: {},
  formError,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UnitStatusBadge', () => {
  it('says the state in words, and an archived unit says so instead', () => {
    const first = renderWithIntl(<UnitStatusBadge status="occupied" />);
    expect(screen.getByText('Ocupada')).toBeInTheDocument();
    first.unmount();
    const second = renderWithIntl(
      <UnitStatusBadge status="under_construction" />,
    );
    expect(screen.getByText('En obra')).toBeInTheDocument();
    second.unmount();
    renderWithIntl(<UnitStatusBadge status="vacant" archived />);
    expect(screen.getByText('Archivada')).toBeInTheDocument();
    expect(screen.queryByText('Vacía')).toBeNull();
  });
});

describe('UnitForm', () => {
  it('asks for the first holder only when a new unit is occupied', () => {
    renderWithIntl(
      <UnitForm action={actions.saveUnitAction} cancelHref="/registry/units" />,
    );
    expect(screen.queryByText('Titular')).toBeNull();
    fireEvent.change(screen.getByLabelText('Estado'), {
      target: { value: 'occupied' },
    });
    expect(screen.getByText('Titular')).toBeInTheDocument();
    expect(screen.getByLabelText('Número')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Crear unidad' }),
    ).toBeInTheDocument();
  });

  it('edits without the holder section and shows what the server rejected, in words', async () => {
    actions.saveUnitAction.mockResolvedValue({
      status: 'error',
      errors: { unit_code: 'unitCodeRequired' },
      formError: 'unitCodeTaken',
    });
    renderWithIntl(
      <UnitForm
        action={actions.saveUnitAction}
        cancelHref="/registry/units/1"
        unit={{
          unit_id: '1',
          unit_code: 'Mz 1',
          unit_block_code: null,
          unit_lot_number: null,
          unit_status: 'occupied',
          unit_coefficient: 1.5,
          unit_is_billable: true,
          unit_contact_phone: null,
          unit_backup_phone: null,
        }}
      />,
    );
    expect(screen.queryByText('Titular')).toBeNull();
    expect(screen.getByLabelText('Coeficiente')).toHaveValue('1.5');
    expect(screen.getByLabelText('Facturable')).toHaveValue('yes');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(
      await screen.findByText('Ya hay una unidad con ese código.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Escribí el código de la unidad.'),
    ).toBeInTheDocument();
    // What was typed stays.
    expect(screen.getByLabelText('Código')).toHaveValue('Mz 1');
    expect(
      actions.saveUnitAction.mock.calls[0]?.[1].get('unit_is_billable'),
    ).toBe('yes');
  });
});

const resident = (overrides: Record<string, unknown> = {}): never =>
  ({
    unit_resident_id: 'r1',
    person_id: 'p1',
    person_first_name: 'Ana',
    person_last_name: 'Gómez',
    person_document_type: 'dni',
    person_document_number: '123',
    person_email: 'ana@x.com',
    person_phone: null,
    person_birth_date: null,
    unit_resident_relationship: 'owner',
    unit_resident_is_holder: true,
    unit_resident_is_minor: false,
    unit_resident_valid_from_at: '2020-01-01T00:00:00Z',
    unit_resident_valid_to_at: null,
    ...overrides,
  }) as never;

describe('ResidentsCard', () => {
  const props = {
    unitId: 'u1',
    accountPersonIds: [] as string[],
    writable: true,
    now: '2026-10-10T12:00:00Z',
    timeZone: 'America/Argentina/Tucuman',
  };

  it('lists residents with their role, offers invitations only to adults with an email and no account', () => {
    renderWithIntl(
      <ResidentsCard
        {...props}
        accountPersonIds={['p3']}
        residents={[
          resident(),
          resident({
            unit_resident_id: 'r2',
            person_id: 'p2',
            person_first_name: 'Mica',
            unit_resident_is_holder: false,
            unit_resident_is_minor: true,
          }),
          resident({
            unit_resident_id: 'r3',
            person_id: 'p3',
            person_first_name: 'Cris',
            unit_resident_is_holder: false,
          }),
          resident({
            unit_resident_id: 'r4',
            person_id: 'p4',
            person_first_name: 'Sin Email',
            person_email: null,
            unit_resident_is_holder: false,
          }),
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Habitantes de la unidad' });
    expect(within(list).getByText('Titular')).toBeInTheDocument();
    expect(within(list).getByText('Menor')).toBeInTheDocument();
    expect(within(list).getByText('Con cuenta')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Invitar a Ana Gómez' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Invitar a Mica Gómez' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Invitar a Cris Gómez' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Invitar a Sin Email Gómez' }),
    ).toBeNull();
  });

  it('moves finished residences out of the way and offers no actions when read-only', () => {
    renderWithIntl(
      <ResidentsCard
        {...props}
        writable={false}
        residents={[
          resident(),
          resident({
            unit_resident_id: 'r9',
            person_id: 'p9',
            person_first_name: 'Vieja',
            unit_resident_valid_to_at: '2025-01-01T00:00:00Z',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Residencias finalizadas (1)')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agregar habitante' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /Finalizar/ })).toBeNull();
  });

  it('confirms before ending a residence, and shows the holder rule when the database refuses', async () => {
    actions.endResidenceAction.mockResolvedValue(
      failure('occupiedNeedsHolder'),
    );
    renderWithIntl(<ResidentsCard {...props} residents={[resident()]} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Finalizar la residencia de Ana Gómez',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '¿Finalizar la residencia?',
    });
    expect(dialog).toHaveTextContent('Ana Gómez deja de vivir en la unidad');
    expect(actions.endResidenceAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Finalizar residencia' }),
    );
    expect(actions.endResidenceAction).toHaveBeenCalledWith('u1', 'p1');
    expect(
      await screen.findByText(
        /Una unidad ocupada necesita al menos un titular adulto vigente/,
      ),
    ).toBeInTheDocument();
  });

  it('opens the add and invite sheets', () => {
    renderWithIntl(<ResidentsCard {...props} residents={[resident()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar habitante' }));
    expect(
      screen.getByRole('dialog', { name: 'Agregar habitante' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Invitar a Ana Gómez' }),
    );
    const sheet = screen.getByRole('dialog', {
      name: 'Invitar a abrir una cuenta',
    });
    expect(within(sheet).getByLabelText('Email', { exact: true })).toHaveValue(
      'ana@x.com',
    );
    expect(within(sheet).getByLabelText('Rol')).toHaveValue('unit_holder');
  });

  it('shows a one-time link once, with a copy button, and nothing of it after closing', async () => {
    actions.inviteResidentAction.mockResolvedValue(
      success('invitationLink', 'http://x.test/invitations/accept?token=abc'),
    );
    renderWithIntl(<ResidentsCard {...props} residents={[resident()]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Invitar a Ana Gómez' }),
    );
    const sheet = screen.getByRole('dialog', {
      name: 'Invitar a abrir una cuenta',
    });
    fireEvent.click(within(sheet).getByLabelText('Enlace de un solo uso'));
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Generar enlace' }),
    );
    expect(
      await within(sheet).findByTestId('one-time-secret'),
    ).toHaveTextContent('http://x.test/invitations/accept?token=abc');
    expect(actions.inviteResidentAction.mock.calls[0]?.[3].get('mode')).toBe(
      'link',
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText(/token=abc/)).toBeNull();
  });
});

describe('OnboardingCard', () => {
  const sheet = {
    unitId: 'u1',
    writable: true,
    timeZone: 'America/Argentina/Tucuman',
    invitations: [
      {
        invitation_id: 'i1',
        invitation_email: 'ana@x.com',
        invitation_membership_role: 'household_member',
        invitation_expires_at: '2026-10-17T12:00:00Z',
      },
    ] as never,
    requests: [
      {
        unit_join_request_id: 'q1',
        unit_join_request_first_name: 'Raúl',
        unit_join_request_last_name: 'Solicitante',
        unit_join_request_email: 'raul@x.com',
        unit_join_request_document_number: '999',
      },
    ] as never,
  };

  it('approves with the chosen role and rejects', async () => {
    actions.decideJoinRequestAction.mockResolvedValue(
      success('requestApproved'),
    );
    renderWithIntl(<OnboardingCard {...sheet} />);
    fireEvent.change(screen.getByLabelText('Rol de Raúl Solicitante'), {
      target: { value: 'unit_holder' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Aprobar a Raúl Solicitante' }),
    );
    expect(actions.decideJoinRequestAction).toHaveBeenCalledWith(
      'u1',
      'q1',
      true,
      'unit_holder',
    );
    expect(
      await screen.findByText(
        'Solicitud aprobada. Enviamos la invitación por email.',
      ),
    ).toBeInTheDocument();
    const reject = screen.getByRole('button', {
      name: 'Rechazar a Raúl Solicitante',
    });
    // The approval is still settling: the buttons are disabled until it ends.
    await waitFor(() => expect(reject).toBeEnabled());
    fireEvent.click(reject);
    expect(actions.decideJoinRequestAction).toHaveBeenLastCalledWith(
      'u1',
      'q1',
      false,
      'unit_holder',
    );
  });

  it('revokes an invitation and words a failure', async () => {
    actions.revokeInvitationAction.mockResolvedValue(failure('denied'));
    renderWithIntl(<OnboardingCard {...sheet} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Revocar la invitación a ana@x.com' }),
    );
    expect(actions.revokeInvitationAction).toHaveBeenCalledWith('u1', 'i1');
    expect(
      await screen.findByText(
        'No tenés permiso para hacer esto, o ya no existe.',
      ),
    ).toBeInTheDocument();
  });

  it('generates a code after a confirmation, shows it grouped once, and hides it on request', async () => {
    actions.rotateJoinCodeAction.mockResolvedValue(
      success('codeRotated', 'abcdefghjklm'),
    );
    renderWithIntl(<OnboardingCard {...sheet} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Código de la unidad' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '¿Generar un código nuevo?',
    });
    expect(dialog).toHaveTextContent('El código anterior deja de funcionar.');
    expect(actions.rotateJoinCodeAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Generar código' }),
    );
    expect(await screen.findByTestId('one-time-secret')).toHaveTextContent(
      'ABCD-EFGH-JKLM',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByTestId('one-time-secret')).toBeNull();
  });

  it('is read-only for a suspended barrio, and says when nothing is pending', () => {
    renderWithIntl(
      <OnboardingCard
        {...sheet}
        writable={false}
        invitations={[]}
        requests={[]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Código de la unidad' }),
    ).toBeNull();
    expect(
      screen.getByText('No hay solicitudes pendientes.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No hay invitaciones pendientes.'),
    ).toBeInTheDocument();
  });
});

const guardRow = (overrides = {}) => ({
  membership_id: 'm1',
  membership_status: 'active' as const,
  membership_valid_from: '2020-01-01T00:00:00Z',
  membership_valid_to: null,
  person_first_name: 'Gabi',
  person_last_name: 'Guardia',
  person_email: 'gabi@x.com',
  gate_ids: ['g1'],
  ...overrides,
});
const gate = (overrides = {}) => ({
  gate_id: 'g1',
  gate_name: 'Norte',
  gate_kind: 'vehicular' as const,
  gate_is_active: true,
  ...overrides,
});

describe('GuardsList', () => {
  const props = {
    guards: [guardRow()],
    gates: [gate(), gate({ gate_id: 'g2', gate_name: 'Sur' })],
    invitations: [
      {
        invitation_id: 'i1',
        invitation_email: 'nuevo@x.com',
        invitation_first_name: 'Nico',
        invitation_last_name: 'Nuevo',
        invitation_status: 'pending' as const,
        invitation_expires_at: '2026-10-17T12:00:00Z',
        invitation_delivered_at: null,
      },
    ],
    writable: true,
    timeZone: 'America/Argentina/Tucuman',
  };

  it('assigns and removes gates with switches', () => {
    actions.assignGuardGateAction.mockResolvedValue(success('assignmentSaved'));
    renderWithIntl(<GuardsList {...props} />);
    expect(screen.getByRole('switch', { name: 'Norte' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Sur' }));
    expect(actions.assignGuardGateAction).toHaveBeenCalledWith(
      'm1',
      'g2',
      true,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Norte' }));
    expect(actions.assignGuardGateAction).toHaveBeenLastCalledWith(
      'm1',
      'g1',
      false,
    );
  });

  it('cannot change assignments when the barrio is read-only', () => {
    renderWithIntl(<GuardsList {...props} writable={false} />);
    expect(screen.getByRole('switch', { name: 'Norte' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Desactivar/ })).toBeNull();
  });

  it('deactivates after a confirmation that names the effect', async () => {
    actions.deactivateGuardAction.mockResolvedValue(
      success('guardDeactivated'),
    );
    renderWithIntl(<GuardsList {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Desactivar a Gabi Guardia' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '¿Desactivar al guardia?',
    });
    expect(dialog).toHaveTextContent('deja de poder ingresar');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(actions.deactivateGuardAction).toHaveBeenCalledWith('m1');
    expect(await screen.findByText('Guardia desactivado.')).toBeInTheDocument();
  });

  it('marks inactive guards by text and lists pending invitations with a revoke action', () => {
    actions.revokeGuardInvitationAction.mockResolvedValue(
      success('invitationRevoked'),
    );
    renderWithIntl(
      <GuardsList
        {...props}
        guards={[guardRow({ membership_status: 'revoked' })]}
      />,
    );
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Desactivar/ })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Revocar la invitación a nuevo@x.com',
      }),
    );
    expect(actions.revokeGuardInvitationAction).toHaveBeenCalledWith('i1');
  });
});

describe('GatesPanel', () => {
  const props = {
    gates: [
      gate(),
      gate({
        gate_id: 'g2',
        gate_name: 'Peatonal',
        gate_kind: 'pedestrian' as const,
        gate_is_active: false,
      }),
    ],
    devices: [
      {
        device_id: 'd1',
        gate_id: 'g1',
        device_name: 'Tablet 1',
        device_status: 'active' as const,
        device_last_sync_at: '2026-10-10T15:30:00Z',
        device_created_at: '2026-10-09T12:00:00Z',
      },
      {
        device_id: 'd2',
        gate_id: 'g1',
        device_name: 'Vieja',
        device_status: 'revoked' as const,
        device_last_sync_at: null,
        device_created_at: '2026-10-01T12:00:00Z',
      },
    ],
    writable: true,
    timeZone: 'America/Argentina/Tucuman',
    tabletUrl: 'http://127.0.0.1:3001/devices/pair',
  };

  it('lists gates by kind and state, and devices with their last sync', () => {
    renderWithIntl(<GatesPanel {...props} />);
    const gates = screen.getByRole('list', { name: 'Puestos del barrio' });
    expect(within(gates).getByText('Vehicular')).toBeInTheDocument();
    expect(within(gates).getAllByText('Peatonal')).toHaveLength(2);
    expect(within(gates).getByText('Inactivo')).toBeInTheDocument();
    // An inactive gate cannot be paired.
    expect(
      screen.getByRole('button', {
        name: 'Vincular una tablet al puesto Norte',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /al puesto Peatonal/ }),
    ).toBeNull();
    const devices = screen.getByRole('table', {
      name: 'Dispositivos vinculados',
    });
    expect(within(devices).getByText('10/10/2026 12:30')).toBeInTheDocument();
    expect(within(devices).getByText('Nunca')).toBeInTheDocument();
    expect(within(devices).getByText('Revocado')).toBeInTheDocument();
    expect(
      within(devices).getAllByRole('button', {
        name: /Revocar el dispositivo/,
      }),
    ).toHaveLength(1);
  });

  it('generates a pairing code, shows it once with the countdown and where to type it', async () => {
    vi.useFakeTimers({
      now: new Date('2026-10-10T12:00:00Z'),
      toFake: ['Date', 'setInterval', 'clearInterval'],
    });
    actions.createPairingAction.mockResolvedValue(
      success(
        'pairingCreated',
        JSON.stringify({
          code: 'a1b2c3d4'.repeat(4),
          expiresAt: '2026-10-10T12:10:00Z',
        }),
      ),
    );
    renderWithIntl(<GatesPanel {...props} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vincular una tablet al puesto Norte',
      }),
    );
    expect(actions.createPairingAction).toHaveBeenCalledWith('g1');
    const sheet = await screen.findByRole('dialog', {
      name: 'Vincular una tablet a Norte',
    });
    expect(
      await within(sheet).findByTestId('one-time-secret'),
    ).toHaveTextContent('A1B2-C3D4-A1B2-C3D4-A1B2-C3D4-A1B2-C3D4');
    expect(within(sheet).getByTestId('countdown')).toHaveTextContent('10:00');
    fireEvent.click(
      within(sheet).getByRole('button', {
        name: 'Más información sobre el código',
      }),
    );
    expect(sheet).toHaveTextContent('http://127.0.0.1:3001/devices/pair');
    act(() => void vi.advanceTimersByTime(11 * 60 * 1000));
    expect(
      within(sheet).getByText('El código venció. Generá uno nuevo.'),
    ).toBeInTheDocument();
    expect(within(sheet).queryByTestId('one-time-secret')).toBeNull();
    expect(
      within(sheet).getByRole('button', { name: 'Generar otro código' }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('words a pairing failure and revokes a device after a confirmation', async () => {
    actions.createPairingAction.mockResolvedValue(failure('denied'));
    actions.revokeDeviceAction.mockResolvedValue(success('deviceRevoked'));
    renderWithIntl(<GatesPanel {...props} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Vincular una tablet al puesto Norte',
      }),
    );
    expect(
      await screen.findByText(
        'No tenés permiso para hacer esto, o ya no existe.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Cerrar' })[0] as HTMLElement,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Revocar el dispositivo Tablet 1' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '¿Revocar el dispositivo?',
    });
    expect(dialog).toHaveTextContent('deja de sincronizar desde ahora');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Revocar dispositivo' }),
    );
    expect(actions.revokeDeviceAction).toHaveBeenCalledWith('d1');
    expect(
      await screen.findByText('Dispositivo revocado.'),
    ).toBeInTheDocument();
  });

  it('offers no changes when the barrio is read-only', () => {
    renderWithIntl(<GatesPanel {...props} writable={false} />);
    expect(screen.queryByRole('button', { name: 'Nuevo puesto' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Vincular una tablet/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Revocar el dispositivo/ }),
    ).toBeNull();
  });
});

describe('PairDeviceForm', () => {
  it('says the same thing for every unusable code', async () => {
    actions.redeemPairingAction.mockResolvedValue(
      failure('pairingUnavailable'),
    );
    renderWithIntl(<PairDeviceForm />);
    fireEvent.change(screen.getByLabelText('Nombre del dispositivo'), {
      target: { value: 'Tablet' },
    });
    fireEvent.change(screen.getByLabelText('Código de vinculación'), {
      target: { value: '0'.repeat(32) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(
      await screen.findByText(
        'El código no es válido, venció o ya se usó. Generá uno nuevo desde Puestos.',
      ),
    ).toBeInTheDocument();
    // What was typed is still there.
    expect(screen.getByLabelText('Nombre del dispositivo')).toHaveValue(
      'Tablet',
    );
  });

  it('confirms the pairing with the device name and can start another', async () => {
    actions.redeemPairingAction.mockResolvedValue(
      success('paired', 'Tablet 1'),
    );
    renderWithIntl(<PairDeviceForm />);
    fireEvent.change(screen.getByLabelText('Nombre del dispositivo'), {
      target: { value: 'Tablet 1' },
    });
    fireEvent.change(screen.getByLabelText('Código de vinculación'), {
      target: { value: 'a'.repeat(32) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    expect(await screen.findByTestId('pair-success')).toHaveTextContent(
      'Dispositivo vinculado: Tablet 1.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vincular otro' }));
    expect(screen.getByLabelText('Nombre del dispositivo')).toHaveValue('');
  });
});

const FIXTURE = path.resolve(
  process.cwd(),
  '../../supabase/fixtures/registry-demo-150.csv',
);
const csv = (text: string, name = 'f.csv') =>
  new File([text], name, { type: 'text/csv' });
const choose = (file: File) =>
  fireEvent.change(
    document.querySelector('input[type="file"]') as HTMLInputElement,
    {
      target: { files: [file] },
    },
  );

describe('ImportWizard', () => {
  it('previews the 150-unit fixture locally, validates with the server, confirms and shows the result', async () => {
    actions.stageImportAction.mockResolvedValue({
      ok: true,
      data: { importId: 'imp1', rowCount: 450, errorCount: 0, errorRows: [] },
    });
    actions.confirmImportAction.mockResolvedValue({
      ok: true,
      data: {
        status: 'confirmed',
        unitCount: 150,
        residentCount: 450,
        errorCount: 0,
        createdUnits: 150,
        createdResidents: 450,
        unchanged: false,
      },
    });
    renderWithIntl(<ImportWizard writable />);
    choose(csv(readFileSync(FIXTURE, 'utf8'), 'registry-demo-150.csv'));
    expect(await screen.findByTestId('import-rows')).toHaveTextContent('450');
    expect(screen.getByTestId('import-units')).toHaveTextContent('150');
    expect(screen.getByTestId('import-residents')).toHaveTextContent('450');
    expect(screen.getByTestId('import-errors')).toHaveTextContent('0');
    expect(screen.getByText('Mostrando 100 de 450.')).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Validar' },
        { timeout: 10_000 },
      ),
    );
    expect(
      await screen.findByText('Todo está listo para importar.'),
    ).toBeInTheDocument();
    const sent = actions.stageImportAction.mock.calls[0]?.[0] as unknown[];
    expect(sent).toHaveLength(450);
    expect(sent[0]).toMatchObject({
      unit_code: 'Demo Mz 1 Lote 1',
      unit_coefficient: 1,
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    );
    expect(await screen.findByTestId('import-outcome')).toHaveTextContent(
      'Importación completa.',
    );
    expect(screen.getByTestId('result-created-units')).toHaveTextContent('150');
  });

  it('says "sin cambios" when re-importing changed nothing', async () => {
    actions.stageImportAction.mockResolvedValue({
      ok: true,
      data: { importId: 'imp2', rowCount: 1, errorCount: 0, errorRows: [] },
    });
    actions.confirmImportAction.mockResolvedValue({
      ok: true,
      data: {
        status: 'confirmed',
        unitCount: 1,
        residentCount: 0,
        errorCount: 0,
        createdUnits: 0,
        createdResidents: 0,
        unchanged: true,
      },
    });
    renderWithIntl(<ImportWizard writable />);
    choose(csv('unit_code\nA1\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Validar' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirmar importación' }),
    );
    expect(await screen.findByTestId('import-outcome')).toHaveTextContent(
      'Sin cambios: los datos ya estaban cargados.',
    );
  });

  it('shows row errors from the schema in words and blocks the next step', async () => {
    renderWithIntl(<ImportWizard writable />);
    choose(
      csv(
        'unit_code,unit_status,unit_coefficient,person_first_name\nA1,vacant,1,\nA2,vacant,abc,\nA3,occupied,1,Ana\n',
      ),
    );
    expect(await screen.findByTestId('import-errors')).toHaveTextContent('2');
    const table = screen.getByRole('table', { name: 'Filas del archivo' });
    expect(table).toHaveTextContent(
      'El coeficiente tiene que ser un número mayor que 0.',
    );
    expect(table).toHaveTextContent('Falta el apellido.');
    // Spreadsheet lines: the header is line 1.
    expect(within(table).getByRole('row', { name: /A2/ })).toHaveTextContent(
      '3',
    );
    expect(screen.queryByRole('button', { name: 'Validar' })).toBeNull();
    expect(actions.stageImportAction).not.toHaveBeenCalled();
  });

  it('shows the errors only the database can see, by line', async () => {
    actions.stageImportAction.mockResolvedValue({
      ok: true,
      data: {
        importId: 'imp3',
        rowCount: 2,
        errorCount: 2,
        errorRows: [
          { row_number: 1, unit_code: 'D1', errors: ['unit_rows_conflict'] },
          {
            row_number: 2,
            unit_code: 'D1',
            errors: ['unit_rows_conflict', 'unit_block_code_invalid'],
          },
        ],
      },
    });
    renderWithIntl(<ImportWizard writable />);
    choose(csv('unit_code,unit_block_code\nD1,1\nD1,2\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Validar' }));
    const table = await screen.findByRole('table', {
      name: 'Filas con errores',
    });
    expect(table).toHaveTextContent(
      'La unidad aparece con datos distintos en varias filas.',
    );
    expect(table).toHaveTextContent('Revisá el valor de «Manzana».');
    expect(
      screen.queryByRole('button', { name: 'Confirmar importación' }),
    ).toBeNull();
    const restart = screen.getByRole('button', { name: 'Empezar de nuevo' });
    await waitFor(() => expect(restart).toBeEnabled());
    fireEvent.click(restart);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['notas.txt', 'hola', 'Solo se pueden importar archivos .csv o .xlsx.'],
    [
      'a.csv',
      'unit_status\nvacant',
      'Falta la columna obligatoria: unit_code.',
    ],
    ['a.csv', 'unit_code\n', 'El archivo no tiene filas para importar.'],
  ])('explains a file problem: %s', async (name, text, message) => {
    renderWithIntl(<ImportWizard writable />);
    choose(csv(text, name));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Sin archivo')).toBeInTheDocument();
  });

  it('words a server failure and offers no file picker when read-only', async () => {
    actions.stageImportAction.mockResolvedValue({ ok: false, error: 'busy' });
    const { unmount } = renderWithIntl(<ImportWizard writable />);
    choose(csv('unit_code\nA1\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Validar' }));
    expect(
      await screen.findByText(
        'Hay otro cambio en curso. Volvé a intentar en unos segundos.',
      ),
    ).toBeInTheDocument();
    unmount();
    renderWithIntl(<ImportWizard writable={false} />);
    expect(screen.queryByRole('button', { name: 'Elegir archivo' })).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Plantilla CSV' }),
      ).toBeInTheDocument(),
    );
  });

  it('downloads the CSV template', async () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderWithIntl(<ImportWizard writable />);
    fireEvent.click(screen.getByRole('button', { name: 'Plantilla CSV' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toContain('text/csv');
    expect(await blob.text()).toContain(
      'unit_code,unit_block_code,unit_lot_number',
    );
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
