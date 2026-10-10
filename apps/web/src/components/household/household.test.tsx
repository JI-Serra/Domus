import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformFormState } from '@/lib/platform/form-state';
import type {
  JoinRequestView,
  MemberView,
  PetView,
  VehicleView,
} from '@/lib/household/view';
import { renderWithShell } from '@/test/render';

type Fn = (...args: never[]) => Promise<PlatformFormState>;
const fn = () => vi.fn<Fn>();
const addMemberAction = fn();
const updateMemberAction = fn();
const inviteResidentAction = fn();
const endMembershipAction = fn();
const resendInvitationAction = fn();
const revokeInvitationAction = fn();
const setPermissionsAction = fn();
const saveVehicleAction = fn();
const removeVehicleAction = fn();
const savePetAction = fn();
const removePetAction = fn();
const decideJoinRequestAction = fn();
const rotateJoinCodeAction = fn();
const upload = vi.fn();

vi.mock('@/app/(app)/home/actions', () => ({
  addMemberAction: (...args: never[]) => addMemberAction(...args),
  updateMemberAction: (...args: never[]) => updateMemberAction(...args),
  inviteResidentAction: (...args: never[]) => inviteResidentAction(...args),
  endMembershipAction: (...args: never[]) => endMembershipAction(...args),
  resendInvitationAction: (...args: never[]) => resendInvitationAction(...args),
  revokeInvitationAction: (...args: never[]) => revokeInvitationAction(...args),
  setPermissionsAction: (...args: never[]) => setPermissionsAction(...args),
  saveVehicleAction: (...args: never[]) => saveVehicleAction(...args),
  removeVehicleAction: (...args: never[]) => removeVehicleAction(...args),
  savePetAction: (...args: never[]) => savePetAction(...args),
  removePetAction: (...args: never[]) => removePetAction(...args),
  decideJoinRequestAction: (...args: never[]) =>
    decideJoinRequestAction(...args),
  rotateJoinCodeAction: (...args: never[]) => rotateJoinCodeAction(...args),
}));
vi.mock('@domus/supabase/browser', () => ({
  createBrowserClient: () => ({
    storage: {
      from: () => ({ upload: (...args: unknown[]) => upload(...args) }),
    },
  }),
}));

const { MemberSection } = await import('./members');
const { VehicleSection } = await import('./vehicles');
const { PetSection } = await import('./pets');
const { JoinRequestSection } = await import('./join-requests');
const { JoinCodeSection } = await import('./join-code');
const { DelegatedSections, OwnData } = await import('./member-view');

const TENANT = '10000000-0000-4000-8000-000000000001';
const UNIT = 'a1000000-0000-4000-8000-000000000001';
const ok = (notice: string): PlatformFormState => ({
  status: 'success',
  notice,
});

const member = (overrides: Partial<MemberView> = {}): MemberView => ({
  residentId: 'r1',
  personId: 'p1',
  firstName: 'Diego',
  lastName: 'Ceibos',
  email: 'diego@domus.local',
  phone: null,
  birthDate: null,
  relationship: 'family',
  standing: 'member',
  isSelf: false,
  detailed: true,
  membershipId: 'm1',
  permissions: ['manage_access_authorizations'],
  invitation: null,
  ...overrides,
});

const noAccount = member({
  standing: 'unregistered',
  membershipId: null,
  permissions: [],
});

const holder = member({
  residentId: 'r0',
  personId: 'p0',
  firstName: 'Carla',
  standing: 'holder',
  isSelf: true,
  membershipId: null,
  permissions: [],
  relationship: 'owner',
});

beforeEach(() => {
  vi.clearAllMocks();
  addMemberAction.mockResolvedValue(ok('invited'));
  updateMemberAction.mockResolvedValue(ok('saved'));
  inviteResidentAction.mockResolvedValue(ok('invited'));
  endMembershipAction.mockResolvedValue(ok('ended'));
  resendInvitationAction.mockResolvedValue(ok('resent'));
  revokeInvitationAction.mockResolvedValue(ok('revoked'));
  setPermissionsAction.mockResolvedValue(ok('permissionsSaved'));
  saveVehicleAction.mockResolvedValue(ok('saved'));
  removeVehicleAction.mockResolvedValue(ok('removed'));
  savePetAction.mockResolvedValue(ok('saved'));
  removePetAction.mockResolvedValue(ok('removed'));
  decideJoinRequestAction.mockResolvedValue(ok('approved'));
  rotateJoinCodeAction.mockResolvedValue({
    status: 'success',
    notice: 'rotated',
    value: 'ABCD-EFGH-JKMN',
  });
  upload.mockResolvedValue({ error: null });
});

describe('MemberSection (holder)', () => {
  it('lists the household with each person standing and the actions that apply', () => {
    renderWithShell(
      <MemberSection
        canManage
        members={[
          holder,
          member(),
          member({
            residentId: 'r2',
            personId: 'p2',
            firstName: 'Ines',
            standing: 'unregistered',
            membershipId: null,
            permissions: [],
          }),
          member({
            residentId: 'r3',
            personId: 'p3',
            firstName: 'Mateo',
            standing: 'minor',
            membershipId: null,
            permissions: [],
          }),
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Miembros del hogar' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText('Titular')).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText('Vos')).toBeVisible();
    // The holder can't edit or end themself.
    expect(
      within(rows[0] as HTMLElement).queryByRole('button'),
    ).not.toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByText('Con cuenta'),
    ).toBeVisible();
    expect(
      within(rows[2] as HTMLElement).getByRole('button', {
        name: 'Invitar a Ines Ceibos',
      }),
    ).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByText('Menor')).toBeVisible();
  });

  it('offers the three delegations only to members with an account, never to minors', () => {
    renderWithShell(
      <MemberSection
        canManage
        members={[
          member(),
          member({
            residentId: 'r3',
            personId: 'p3',
            firstName: 'Mateo',
            standing: 'minor',
            membershipId: null,
            permissions: [],
          }),
        ]}
      />,
    );
    const group = screen.getByRole('group', {
      name: 'Permisos de Diego Ceibos',
    });
    const switches = within(group).getAllByRole('switch');
    expect(
      switches.map(
        (entry) =>
          entry.getAttribute('aria-checked') ??
          (entry as HTMLInputElement).checked,
      ),
    ).toEqual([false, false, true]);
    expect(
      within(group).getByLabelText('Ver finanzas de la unidad'),
    ).not.toBeChecked();
    expect(
      within(group).getByLabelText('Reservar amenities'),
    ).not.toBeChecked();
    expect(
      within(group).getByLabelText('Gestionar autorizaciones y pases'),
    ).toBeChecked();
    expect(
      screen.queryByRole('group', { name: 'Permisos de Mateo Ceibos' }),
    ).not.toBeInTheDocument();
  });

  it('sends the complete permission set on each toggle and rolls back when refused', async () => {
    renderWithShell(<MemberSection canManage members={[member()]} />);
    fireEvent.click(screen.getByLabelText('Ver finanzas de la unidad'));
    await waitFor(() =>
      expect(setPermissionsAction).toHaveBeenCalledWith('m1', [
        'view_unit_finance',
        'manage_access_authorizations',
      ]),
    );
    expect(await screen.findByText('Permisos guardados.')).toBeVisible();

    setPermissionsAction.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'denied',
    });
    fireEvent.click(screen.getByLabelText('Reservar amenities'));
    expect(
      await screen.findByText('No tenés permiso para hacer esto.'),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('Reservar amenities')).not.toBeChecked(),
    );
  });

  it('offers neither edit nor removal for a person with an account (only a registry admin can)', () => {
    renderWithShell(<MemberSection canManage members={[member()]} />);
    expect(
      screen.queryByRole('button', { name: /Editar|Quitar/ }),
    ).not.toBeInTheDocument();
  });

  it('removes a person from the household only after confirming the effect', async () => {
    renderWithShell(<MemberSection canManage members={[noAccount]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Quitar a Diego Ceibos del hogar' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Quitar a Diego Ceibos del hogar',
      hidden: true,
    });
    expect(
      within(dialog).getByText(/Pierde el acceso a la unidad/),
    ).toBeInTheDocument();
    expect(endMembershipAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Quitar del hogar',
        hidden: true,
      }),
    );
    await waitFor(() => expect(endMembershipAction).toHaveBeenCalledWith('p1'));
    expect(
      await screen.findByText('Quitaste a la persona del hogar.'),
    ).toBeVisible();
  });

  it('opens the add form in a sheet, with the email behind an info button and no email for minors', async () => {
    renderWithShell(<MemberSection canManage members={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar miembro' });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Más información sobre agregar miembros',
      }),
    );
    expect(within(dialog).getByText(/enlace de un solo uso/)).toBeVisible();
    expect(within(dialog).getByLabelText('Email')).toBeVisible();
    fireEvent.click(within(dialog).getByLabelText('Es menor de edad'));
    expect(within(dialog).queryByLabelText('Email')).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Guardar' }),
    ).toBeVisible();
  });

  it('shows the field errors the action answers and keeps what was typed', async () => {
    addMemberAction.mockResolvedValue({
      status: 'error',
      errors: {
        person_first_name: 'firstNameRequired',
        person_email: 'emailRequired',
      },
      values: { person_last_name: 'Ceibos' },
    });
    renderWithShell(<MemberSection canManage members={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar miembro' });
    fireEvent.change(within(dialog).getByLabelText('Apellido'), {
      target: { value: 'Ceibos' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Enviar invitación' }),
    );
    expect(await within(dialog).findByText('Escribí el nombre.')).toBeVisible();
    expect(within(dialog).getByText('Escribí el email.')).toBeVisible();
    expect(within(dialog).getByLabelText('Apellido')).toHaveValue('Ceibos');
  });

  it('closes the sheet and confirms when the member was invited', async () => {
    renderWithShell(<MemberSection canManage members={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar miembro' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar miembro' });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Enviar invitación' }),
    );
    expect(await screen.findByText('Invitación enviada.')).toBeVisible();
    const [, data] = addMemberAction.mock.calls[0] as unknown as [
      unknown,
      FormData,
    ];
    expect(data.get('client_event_id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.get('invitation_event_id')).not.toBe(
      data.get('client_event_id'),
    );
  });

  it('shows a pending invitation with its expiry and lets the holder resend or revoke it', async () => {
    renderWithShell(
      <MemberSection
        canManage
        members={[
          member({
            standing: 'invited',
            membershipId: null,
            permissions: [],
            invitation: {
              invitationId: 'i1',
              eventId: 'e1',
              email: 'diego@domus.local',
              expiresAt: '2026-10-17T12:00:00Z',
              delivered: false,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText('Invitado')).toBeVisible();
    expect(screen.getByText(/diego@domus.local · Vence/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reenviar la invitación a Diego Ceibos',
      }),
    );
    await waitFor(() =>
      expect(resendInvitationAction).toHaveBeenCalledWith('i1'),
    );
    expect(await screen.findByText('Invitación reenviada.')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Revocar la invitación de Diego Ceibos',
      }),
    );
    await waitFor(() =>
      expect(revokeInvitationAction).toHaveBeenCalledWith('i1'),
    );
  });

  it('does not offer a resend for an invitation that was already delivered', () => {
    renderWithShell(
      <MemberSection
        canManage
        members={[
          member({
            standing: 'invited',
            membershipId: null,
            invitation: {
              invitationId: 'i1',
              eventId: 'e1',
              email: 'diego@domus.local',
              expiresAt: '2026-10-17T12:00:00Z',
              delivered: true,
            },
          }),
        ]}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Reenviar/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Revocar/ })).toBeVisible();
  });

  it('disables every write while the barrio is read-only (suspended)', () => {
    renderWithShell(
      <MemberSection canManage members={[member(), noAccount]} />,
      undefined,
      {
        tenantStatus: 'suspended',
      },
    );
    expect(
      screen.getByRole('button', { name: 'Agregar miembro' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Editar a Diego Ceibos' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Reservar amenities')).toBeDisabled();
  });
});

describe('MemberSection (household member)', () => {
  it('shows the household without any action or toggle, and no add button', () => {
    renderWithShell(
      <MemberSection
        canManage={false}
        members={[
          member({
            firstName: 'Carla',
            standing: 'holder',
            detailed: false,
            email: null,
            membershipId: null,
          }),
          member({ isSelf: true, firstName: 'Diego' }),
        ]}
      />,
    );
    expect(screen.getByText('Carla Ceibos')).toBeVisible();
    expect(screen.getByText('Diego Ceibos')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    // Another resident's email is not shown to a member.
    expect(screen.queryByText(/carla@/)).not.toBeInTheDocument();
  });
});

describe('DelegatedSections and OwnData', () => {
  it('shows a card only for each permission the holder enabled', () => {
    renderWithShell(
      <DelegatedSections permissions={['manage_access_authorizations']} />,
    );
    const list = screen.getByRole('list', { name: 'Habilitado para vos' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Autorizaciones y pases')).toBeVisible();
    expect(screen.queryByText('Finanzas de la unidad')).not.toBeInTheDocument();
    expect(screen.queryByText('Reservas de amenities')).not.toBeInTheDocument();
  });

  it('adds the cards when permissions grow, in a fixed order', () => {
    renderWithShell(
      <DelegatedSections
        permissions={['manage_access_authorizations', 'view_unit_finance']}
      />,
    );
    const items = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items[0]).toContain('Finanzas de la unidad');
    expect(items[1]).toContain('Autorizaciones y pases');
  });

  it('says so when nothing is enabled', () => {
    renderWithShell(<DelegatedSections permissions={[]} />);
    expect(screen.getByText('Todavía no tenés nada habilitado')).toBeVisible();
  });

  it('shows the own profile read-only', () => {
    renderWithShell(<OwnData member={member({ phone: '3815550000' })} />);
    expect(screen.getByText('diego@domus.local')).toBeVisible();
    expect(screen.getByText('3815550000')).toBeVisible();
    expect(screen.getByText('Familiar')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

const vehicle: VehicleView = {
  vehicleId: 'v1',
  plate: 'AB123CD',
  make: 'Fiat',
  model: 'Cronos',
  color: 'Gris',
};

describe('VehicleSection', () => {
  it('writes plates the way people do and keeps the format help behind an info button', () => {
    renderWithShell(<VehicleSection canManage vehicles={[vehicle]} />);
    expect(screen.getByText('AB 123 CD')).toBeVisible();
    expect(screen.getByText('Fiat · Cronos · Gris')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar vehículo' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar vehículo' });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Más información sobre el formato de la patente',
      }),
    );
    expect(within(dialog).getByText(/AB 123 CD \(desde 2016\)/)).toBeVisible();
  });

  it('shows the plate error the action answers', async () => {
    saveVehicleAction.mockResolvedValue({
      status: 'error',
      errors: { vehicle_plate_code: 'plateInvalid' },
      values: {},
    });
    renderWithShell(<VehicleSection canManage vehicles={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar vehículo' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar vehículo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText(/Revisá la patente/)).toBeVisible();
  });

  it('removes a vehicle after confirming', async () => {
    renderWithShell(<VehicleSection canManage vehicles={[vehicle]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar el vehículo AB 123 CD' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: /Eliminar el vehículo/,
      hidden: true,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Eliminar vehículo',
        hidden: true,
      }),
    );
    await waitFor(() => expect(removeVehicleAction).toHaveBeenCalledWith('v1'));
    expect(await screen.findByText('Eliminado.')).toBeVisible();
  });

  it('is read-only for a member', () => {
    renderWithShell(<VehicleSection canManage={false} vehicles={[vehicle]} />);
    expect(screen.getByText('AB 123 CD')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has an empty state', () => {
    renderWithShell(<VehicleSection canManage vehicles={[]} />);
    expect(screen.getByText('Sin vehículos')).toBeVisible();
  });
});

const pet: PetView = {
  petId: 'pet1',
  name: 'Luna',
  species: 'Perro',
  breed: 'Mestiza',
  photoPath: null,
};

describe('PetSection', () => {
  it('lists pets and shows a stored photo from its signed URL', () => {
    renderWithShell(
      <PetSection
        canManage
        pets={[{ ...pet, photoPath: `${TENANT}/${UNIT}/x.png` }]}
        photoUrls={{ pet1: 'https://files.test/luna.png?token=1' }}
        tenantId={TENANT}
        unitId={UNIT}
      />,
    );
    expect(screen.getByText('Luna')).toBeVisible();
    expect(screen.getByText('Perro · Mestiza')).toBeVisible();
    expect(screen.getByAltText('Foto de Luna')).toHaveAttribute(
      'src',
      'https://files.test/luna.png?token=1',
    );
  });

  it('uploads a chosen photo to the unit folder of the private bucket and sends only its path', async () => {
    renderWithShell(
      <PetSection
        canManage
        pets={[]}
        photoUrls={{}}
        tenantId={TENANT}
        unitId={UNIT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mascota' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar mascota' });
    fireEvent.change(within(dialog).getByLabelText('Nombre'), {
      target: { value: 'Luna' },
    });
    const input = dialog.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(within(dialog).getByText('Sin foto')).toBeVisible();
    const file = new File([new Uint8Array(10)], 'luna.png', {
      type: 'image/png',
    });
    URL.createObjectURL = vi.fn(() => 'blob:luna');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const [path, uploaded, options] = upload.mock.calls[0] as [
      string,
      File,
      { contentType: string },
    ];
    expect(path).toMatch(new RegExp(`^${TENANT}/${UNIT}/[0-9a-f-]{36}\\.png$`));
    expect(uploaded).toBe(file);
    expect(options).toEqual({ contentType: 'image/png' });
    expect(await within(dialog).findByText('luna.png')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(savePetAction).toHaveBeenCalled());
    // Bound with the pet id (null: a new pet), then the previous state and the form.
    const [petId, , data] = savePetAction.mock.calls[0] as unknown as [
      string | null,
      unknown,
      FormData,
    ];
    expect(petId).toBeNull();
    expect(data.get('pet_photo_path')).toBe(path);
  });

  it('rejects a photo of the wrong type or size before uploading', async () => {
    renderWithShell(
      <PetSection
        canManage
        pets={[]}
        photoUrls={{}}
        tenantId={TENANT}
        unitId={UNIT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mascota' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar mascota' });
    const input = dialog.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'x.gif', { type: 'image/gif' })] },
      });
    });
    expect(
      await within(dialog).findByText('La foto tiene que ser PNG, JPG o WebP.'),
    ).toBeVisible();
    const big = new File([new Uint8Array(10)], 'big.png', {
      type: 'image/png',
    });
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [big] } });
    });
    expect(
      await within(dialog).findByText('La foto pesa más de 2 MB.'),
    ).toBeVisible();
    expect(upload).not.toHaveBeenCalled();
  });

  it('says when the upload fails and does not offer the photo as chosen', async () => {
    upload.mockResolvedValue({ error: { message: 'nope' } });
    renderWithShell(
      <PetSection
        canManage
        pets={[]}
        photoUrls={{}}
        tenantId={TENANT}
        unitId={UNIT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agregar mascota' }));
    const dialog = screen.getByRole('dialog', { name: 'Agregar mascota' });
    const input = dialog.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [new File(['x'], 'luna.png', { type: 'image/png' })],
        },
      });
    });
    expect(
      await within(dialog).findByText(
        'No pudimos subir la foto. Probá de nuevo.',
      ),
    ).toBeVisible();
    expect(within(dialog).getByText('Sin foto')).toBeVisible();
  });

  it('removes a pet after confirming', async () => {
    renderWithShell(
      <PetSection
        canManage
        pets={[pet]}
        photoUrls={{}}
        tenantId={TENANT}
        unitId={UNIT}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Luna' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Eliminar a Luna',
      hidden: true,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Eliminar mascota',
        hidden: true,
      }),
    );
    await waitFor(() => expect(removePetAction).toHaveBeenCalledWith('pet1'));
  });
});

const request: JoinRequestView = {
  requestId: 'q1',
  firstName: 'Ana',
  lastName: 'Gómez',
  email: 'ana@domus.local',
  createdAt: '2026-10-09T10:00:00Z',
};

describe('JoinRequestSection (D22)', () => {
  it('shows nothing when there is no request', () => {
    const { container } = renderWithShell(<JoinRequestSection requests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('approves with a key that is the same on a retry, and rejects', async () => {
    renderWithShell(<JoinRequestSection requests={[request]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Aprobar la solicitud de Ana Gómez' }),
    );
    await waitFor(() =>
      expect(decideJoinRequestAction).toHaveBeenCalledTimes(1),
    );
    expect(await screen.findByText(/Solicitud aprobada/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Rechazar la solicitud de Ana Gómez',
      }),
    );
    await waitFor(() =>
      expect(decideJoinRequestAction).toHaveBeenCalledTimes(2),
    );
    const [first, second] = decideJoinRequestAction.mock.calls as unknown as [
      [string, boolean, string],
      [string, boolean, string],
    ];
    expect(first.slice(0, 2)).toEqual(['q1', true]);
    expect(second.slice(0, 2)).toEqual(['q1', false]);
    expect(first[2]).toBe(second[2]);
  });

  it('explains the request flow behind an info button', () => {
    renderWithShell(<JoinRequestSection requests={[request]} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre las solicitudes',
      }),
    );
    expect(
      screen.getByText(/hasta que la acepte no tiene acceso/),
    ).toBeVisible();
  });
});

describe('JoinCodeSection (D22)', () => {
  it('asks before generating, then shows the new code once with a copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderWithShell(<JoinCodeSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar código' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Generar un código nuevo',
      hidden: true,
    });
    expect(
      within(dialog).getByText('El código anterior deja de funcionar.'),
    ).toBeInTheDocument();
    expect(rotateJoinCodeAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Generar código',
        hidden: true,
      }),
    );
    expect(await screen.findByTestId('unit-code')).toHaveTextContent(
      'ABCD-EFGH-JKMN',
    );
    expect(
      screen.getByRole('button', { name: 'Generar código nuevo' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN'),
    );
    expect(
      await screen.findByRole('button', { name: 'Copiado' }),
    ).toBeVisible();
  });

  it('shows the refusal and no code when the database says no', async () => {
    rotateJoinCodeAction.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'denied',
    });
    renderWithShell(<JoinCodeSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Generar código' }));
    fireEvent.click(
      within(
        screen.getByRole('dialog', {
          name: 'Generar un código nuevo',
          hidden: true,
        }),
      ).getByRole('button', { name: 'Generar código', hidden: true }),
    );
    expect(
      await screen.findByText('No tenés permiso para hacer esto.'),
    ).toBeVisible();
    expect(screen.queryByTestId('unit-code')).not.toBeInTheDocument();
  });
});
