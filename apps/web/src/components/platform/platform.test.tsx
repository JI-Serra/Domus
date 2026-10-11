import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SupportTarget,
  SupportTargetsResult,
} from '@/app/platform/support/actions';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { renderWithIntl } from '@/test/render';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SubscriptionBadge } from './subscription-badge';
import { BillableForm } from './billable-form';
import { InvitationList, InviteAdminForm } from './invitations';
import { SubscriptionPanel } from './subscription-panel';
import { SupportSessionList } from './support-session-list';
import { SupportStartForm } from './support-start-form';
import { TenantForm } from './tenant-form';
import { ActiveSupportSession } from './active-support-session';

type Action = (
  previous: PlatformFormState,
  data: FormData,
) => Promise<PlatformFormState>;
const IDLE: PlatformFormState = { status: 'idle' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConfirmDialog', () => {
  it('opens as a modal dialog stating the effect, and cancels with Escape', () => {
    const onCancel = vi.fn();
    const { rerender } = renderWithIntl(
      <ConfirmDialog
        open={false}
        title="¿Seguro?"
        confirmLabel="Sí"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Se corta el acceso.
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <ConfirmDialog
        open
        title="¿Seguro?"
        confirmLabel="Sí"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Se corta el acceso.
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: '¿Seguro?' });
    expect(dialog).toHaveTextContent('Se corta el acceso.');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('confirms and cancels with its buttons, and ignores Escape while working', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithIntl(
      <ConfirmDialog
        open
        pending
        tone="destructive"
        title="T"
        confirmLabel="Sí"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        x
      </ConfirmDialog>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Sí' })).toBeDisabled();
  });
});

describe('SubscriptionBadge', () => {
  it.each([
    ['pilot', 'Piloto'],
    ['active', 'Activo'],
    ['suspended', 'Suspendido'],
    ['cancelled', 'Baja'],
  ] as const)(
    'shows %s as text (with an icon), not color alone',
    (status, label) => {
      const { container } = renderWithIntl(
        <SubscriptionBadge status={status} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );
});

describe('SubscriptionPanel', () => {
  const change = vi.fn<(status: string) => Promise<PlatformFormState>>();

  it('states the effect of suspending before applying it, and applies on confirm', async () => {
    change.mockResolvedValue({ status: 'success', notice: 'statusChanged' });
    renderWithIntl(<SubscriptionPanel current="active" change={change} />);

    fireEvent.change(screen.getByLabelText('Nuevo estado'), {
      target: { value: 'suspended' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('¿Pasar el barrio a Suspendido?');
    expect(dialog).toHaveTextContent('solo lectura');
    expect(change).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirmar cambio' }),
    );
    await waitFor(() => expect(change).toHaveBeenCalledWith('suspended'));
    expect(
      await screen.findByText('Suscripción actualizada.'),
    ).toBeInTheDocument();
  });

  it('says that cancelling closes access, and cancelling the dialog changes nothing', () => {
    renderWithIntl(<SubscriptionPanel current="active" change={change} />);
    fireEvent.change(screen.getByLabelText('Nuevo estado'), {
      target: { value: 'cancelled' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'dejan de tener acceso',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it('offers every status but the current one and shows the current one', () => {
    renderWithIntl(<SubscriptionPanel current="suspended" change={change} />);
    const options = within(screen.getByLabelText('Nuevo estado'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['Piloto', 'Activo', 'Baja']);
    expect(screen.getAllByText('Suspendido').length).toBeGreaterThan(0);
  });

  it('shows the error when the change is refused', async () => {
    change.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'denied',
    });
    renderWithIntl(<SubscriptionPanel current="active" change={change} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar estado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }));
    expect(
      await screen.findByText(/No tenés permiso para hacer este cambio/),
    ).toBeInTheDocument();
  });
});

describe('TenantForm', () => {
  it('suggests the identifier from the name until it is edited by hand', () => {
    const action = vi.fn<Action>().mockResolvedValue(IDLE);
    renderWithIntl(<TenantForm mode="create" action={action} />);
    const name = screen.getByLabelText('Nombre');
    const slug = screen.getByLabelText('Identificador');
    fireEvent.change(name, { target: { value: 'Los Ñandúes' } });
    expect(slug).toHaveValue('los-nandues');
    fireEvent.change(slug, { target: { value: 'mio' } });
    fireEvent.change(name, { target: { value: 'Otro Nombre' } });
    expect(slug).toHaveValue('mio');
  });

  it('submits the typed values with a stable event id, and shows field errors without losing input', async () => {
    const action = vi.fn<Action>().mockResolvedValue({
      status: 'error',
      errors: { tenant_slug: 'slugTaken' },
      values: { tenant_name: 'Los Ceibos', tenant_slug: 'los-ceibos' },
    });
    renderWithIntl(<TenantForm mode="create" action={action} />);
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Los Ceibos' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Crear barrio' }));

    expect(
      await screen.findByText(
        'Ya hay un barrio con ese identificador. Elegí otro.',
      ),
    ).toBeInTheDocument();
    const data = action.mock.calls[0]?.[1];
    expect(data?.get('tenant_name')).toBe('Los Ceibos');
    expect(data?.get('tenant_slug')).toBe('los-ceibos');
    expect(data?.get('tenant_subscription_status')).toBe('pilot');
    expect(String(data?.get('client_event_id'))).toMatch(/^[0-9a-f-]{36}$/);
    // The form keeps what was typed (it is not reset by a failed submit).
    expect(screen.getByLabelText('Nombre')).toHaveValue('Los Ceibos');
    expect(screen.getByLabelText('Identificador')).toHaveValue('los-ceibos');
  });

  it('shows the form-level error and the saved notice', async () => {
    const action = vi
      .fn<Action>()
      .mockResolvedValueOnce({
        status: 'error',
        errors: {},
        formError: 'unknown',
      })
      .mockResolvedValueOnce({ status: 'success', notice: 'saved' });
    renderWithIntl(
      <TenantForm
        mode="edit"
        action={action}
        tenant={{
          tenant_name: 'Los Ceibos',
          tenant_slug: 'los-ceibos',
          tenant_address: null,
          tenant_time_zone: 'America/Argentina/Tucuman',
        }}
        logoUrl="http://storage.test/logo.png"
      />,
    );
    // Editing shows the identifier as plain text and the current logo.
    expect(screen.getByText('los-ceibos')).toBeInTheDocument();
    expect(screen.queryByLabelText('Identificador')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'Logo de Los Ceibos' }),
    ).toHaveAttribute('src', 'http://storage.test/logo.png');
    fireEvent.submit(screen.getByRole('form', { name: 'Datos del barrio' }));
    expect(
      await screen.findByText(/Algo salió mal de nuestro lado/),
    ).toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Datos del barrio' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
  });

  it('shows "sin logo" when the barrio has none', () => {
    renderWithIntl(
      <TenantForm
        mode="edit"
        action={vi.fn<Action>()}
        tenant={{
          tenant_name: 'X',
          tenant_slug: 'x',
          tenant_address: 'Calle 1',
          tenant_time_zone: 'America/Montevideo',
        }}
      />,
    );
    expect(screen.getByText('Sin logo')).toBeInTheDocument();
    // An unusual stored zone is still selectable.
    expect(screen.getByLabelText('Zona horaria')).toHaveValue(
      'America/Montevideo',
    );
  });
});

describe('BillableForm', () => {
  it('shows the stored criteria, explains the missing count behind the info button and saves', async () => {
    const action = vi
      .fn<Action>()
      .mockResolvedValue({ status: 'success', notice: 'saved' });
    renderWithIntl(
      <BillableForm
        selected={['occupied', 'vacant']}
        count={28}
        action={action}
      />,
    );
    // M01-F03: the count of billable units, computed by the database.
    expect(screen.getByTestId('billable-count')).toHaveTextContent('28');
    expect(screen.getByRole('switch', { name: 'Ocupada' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'En obra' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Vacía' })).toBeChecked();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre las unidades facturables',
      }),
    );
    expect(
      screen.getByText(/las unidades archivadas no cuentan/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'En obra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar criterios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(action.mock.calls[0]?.[1].getAll('unit_status')).toEqual([
      'occupied',
      'under_construction',
      'vacant',
    ]);
  });

  it('shows the error returned for an empty selection', async () => {
    const action = vi.fn<Action>().mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'billableRequired',
    });
    renderWithIntl(
      <BillableForm selected={['occupied']} count={null} action={action} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar criterios' }));
    expect(
      await screen.findByText('Elegí al menos un estado de unidad.'),
    ).toBeInTheDocument();
  });
});

describe('InviteAdminForm and InvitationList', () => {
  it('sends the first admin invitation and renews the retry key after a success', async () => {
    const action = vi
      .fn<Action>()
      .mockResolvedValue({ status: 'success', notice: 'invited' });
    renderWithIntl(<InviteAdminForm action={action} />);
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('Apellido'), {
      target: { value: 'Pérez' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ana@ejemplo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(await screen.findByText('Invitación enviada.')).toBeInTheDocument();
    const first = action.mock.calls[0]?.[1];
    expect(first?.get('invited_email')).toBe('ana@ejemplo.com');
    const firstKey = String(first?.get('client_event_id'));

    // Next invitation: empty form, new key.
    expect(screen.getByLabelText('Email')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(String(action.mock.calls[1]?.[1].get('client_event_id'))).not.toBe(
      firstKey,
    );
  });

  it('keeps the same key and the typed values when delivery fails, so a retry cannot duplicate', async () => {
    const action = vi.fn<Action>().mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'deliveryFailed',
      values: {
        first_name: 'Ana',
        last_name: 'Pérez',
        invited_email: 'ana@ejemplo.com',
      },
    });
    renderWithIntl(<InviteAdminForm action={action} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ana@ejemplo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    expect(
      await screen.findByText(/No pudimos enviar el email/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1]?.[1].get('client_event_id')).toBe(
      action.mock.calls[0]?.[1].get('client_event_id'),
    );
  });

  const invitation = (id: string, status: string, expires: string) => ({
    invitation_id: id,
    invitation_email: `${id}@ejemplo.com`,
    invitation_first_name: 'Ana',
    invitation_last_name: 'Pérez',
    invitation_status: status as 'pending',
    invitation_expires_at: expires,
  });

  it('lists invitations with their status; only a live pending one can be revoked', async () => {
    const revoke = vi
      .fn()
      .mockResolvedValue({ status: 'success', notice: 'revoked' });
    renderWithIntl(
      <InvitationList
        now="2026-10-10T12:00:00Z"
        revoke={revoke}
        invitations={[
          invitation('p', 'pending', '2026-10-15T00:00:00Z'),
          invitation('o', 'pending', '2026-10-01T00:00:00Z'),
          invitation('a', 'accepted', '2026-10-15T00:00:00Z'),
          invitation('r', 'revoked', '2026-10-15T00:00:00Z'),
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Invitaciones del barrio' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('Pendiente')).toBeInTheDocument();
    expect(within(list).getByText('Vencida')).toBeInTheDocument();
    expect(within(list).getByText('Aceptada')).toBeInTheDocument();
    expect(within(list).getByText('Revocada')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /^Revocar la invitación/ }),
    ).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Revocar la invitación de p@ejemplo.com',
      }),
    );
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('p'));
  });

  it('shows why a revocation failed', async () => {
    const revoke = vi
      .fn()
      .mockResolvedValue({ status: 'error', errors: {}, formError: 'denied' });
    renderWithIntl(
      <InvitationList
        now="2026-10-10T12:00:00Z"
        revoke={revoke}
        invitations={[invitation('p', 'pending', '2026-10-15T00:00:00Z')]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Revocar/ }));
    expect(await screen.findByText(/No tenés permiso/)).toBeInTheDocument();
  });

  it('says so when there are no invitations', () => {
    renderWithIntl(
      <InvitationList
        now="2026-10-10T12:00:00Z"
        revoke={vi.fn()}
        invitations={[]}
      />,
    );
    expect(
      screen.getByText('Todavía no enviaste invitaciones'),
    ).toBeInTheDocument();
  });
});

describe('SupportStartForm', () => {
  const targets: SupportTarget[] = [
    {
      user_id: 'u1',
      person_first_name: 'Ana',
      person_last_name: 'Ceibos',
      membership_role: 'tenant_admin',
    },
    {
      user_id: 'u1',
      person_first_name: 'Ana',
      person_last_name: 'Ceibos',
      membership_role: 'unit_holder',
    },
    {
      user_id: 'u2',
      person_first_name: 'Bruno',
      person_last_name: 'Ceibos',
      membership_role: 'guard',
    },
  ];
  const tenants = [
    {
      tenant_id: '10000000-0000-4000-8000-000000000001',
      tenant_name: 'Los Ceibos',
    },
    {
      tenant_id: '10000000-0000-4000-8000-000000000002',
      tenant_name: 'Las Tipas',
    },
  ];

  it('looks people up when a barrio is chosen, lists each person once with all their roles, and submits the choice', async () => {
    const lookup = vi
      .fn<(tenantId: string, search: string) => Promise<SupportTargetsResult>>()
      .mockResolvedValue({ ok: true, targets });
    const action = vi.fn<Action>().mockResolvedValue(IDLE);
    renderWithIntl(
      <SupportStartForm tenants={tenants} lookup={lookup} action={action} />,
    );

    expect(screen.getByLabelText('Persona', { exact: true })).toBeDisabled();
    expect(screen.getByLabelText('Duración (minutos)')).toHaveValue(30);
    fireEvent.change(screen.getByLabelText('Barrio'), {
      target: { value: tenants[0]?.tenant_id },
    });
    await waitFor(
      () => expect(lookup).toHaveBeenCalledWith(tenants[0]?.tenant_id, ''),
      {
        timeout: 2000,
      },
    );
    const person = screen.getByLabelText('Persona', { exact: true });
    await waitFor(() =>
      expect(within(person).getAllByRole('option')).toHaveLength(3),
    );
    expect(
      within(person).getByRole('option', {
        name: 'Ana Ceibos · Administrador, Titular',
      }),
    ).toBeInTheDocument();

    fireEvent.change(person, { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Revisar un acceso' },
    });
    fireEvent.submit(person.closest('form') as HTMLFormElement);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const data = action.mock.calls[0]?.[1];
    expect(data?.get('target_tenant_id')).toBe(tenants[0]?.tenant_id);
    expect(data?.get('target_user_id')).toBe('u2');
    expect(data?.get('reason')).toBe('Revisar un acceso');
    expect(data?.get('duration_minutes')).toBe('30');
  });

  it('searches by name after a pause and shows an empty result', async () => {
    const lookup = vi
      .fn<(tenantId: string, search: string) => Promise<SupportTargetsResult>>()
      .mockResolvedValue({ ok: true, targets: [] });
    renderWithIntl(
      <SupportStartForm
        tenants={tenants}
        lookup={lookup}
        action={vi.fn<Action>()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Barrio'), {
      target: { value: tenants[0]?.tenant_id },
    });
    fireEvent.change(screen.getByLabelText('Buscar persona'), {
      target: { value: 'zzz' },
    });
    await waitFor(
      () =>
        expect(lookup).toHaveBeenLastCalledWith(tenants[0]?.tenant_id, 'zzz'),
      {
        timeout: 2000,
      },
    );
    expect(
      await screen.findByRole('option', {
        name: 'No hay personas para mostrar',
      }),
    ).toBeInTheDocument();
  });

  it('tells the admin when the lookup failed', async () => {
    const lookup = vi
      .fn<(tenantId: string, search: string) => Promise<SupportTargetsResult>>()
      .mockResolvedValue({ ok: false, error: 'lookupFailed' });
    renderWithIntl(
      <SupportStartForm
        tenants={tenants}
        lookup={lookup}
        action={vi.fn<Action>()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Barrio'), {
      target: { value: tenants[0]?.tenant_id },
    });
    expect(
      await screen.findByText(
        'No pudimos cargar las personas. Volvé a intentar.',
        undefined,
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
  });

  it('shows the validation and start errors the server returns, keeping the reason typed', async () => {
    const action = vi.fn<Action>().mockResolvedValue({
      status: 'error',
      errors: { reason: 'reasonRequired' },
      formError: 'sessionActive',
      values: { reason: '', duration_minutes: '45' },
    });
    renderWithIntl(
      <SupportStartForm tenants={tenants} lookup={vi.fn()} action={action} />,
    );
    fireEvent.submit(
      screen.getByLabelText('Motivo').closest('form') as HTMLFormElement,
    );
    expect(await screen.findByText('Escribí el motivo.')).toBeInTheDocument();
    expect(
      screen.getByText(/Ya tenés una sesión de soporte activa/),
    ).toBeInTheDocument();
  });
});

describe('SupportSessionList and ActiveSupportSession', () => {
  const statusLabels = {
    active: 'Activa',
    ended: 'Finalizada',
    revoked: 'Revocada',
    expired: 'Vencida',
  };
  const base = {
    support_session_reason: 'Revisar un acceso',
    support_session_started_at: '2026-10-10T11:00:00Z',
    support_session_expires_at: '2026-10-10T11:30:00Z',
    support_session_ended_at: '2026-10-10T11:12:00Z',
    actorLabel: 'Equipo de Domus',
    targetLabel: 'Marta Soporte',
  };
  const render = (
    sessions: Parameters<typeof SupportSessionList>[0]['sessions'],
  ) =>
    renderWithIntl(
      <SupportSessionList
        sessions={sessions}
        now={new Date('2026-10-10T12:00:00Z')}
        label="Accesos"
        empty="Nada"
        durationLabel="Duración"
        statusLabels={statusLabels}
        whoLabel="Quién"
        asLabel="Como"
        reasonLabel="Motivo"
        minutesLabel={(minutes) => `${minutes} min`}
      />,
    );

  it('shows who, as whom, why, when, how long and the status', () => {
    render([
      {
        ...base,
        support_session_id: 's1',
        support_session_status: 'ended',
        tenantName: 'Los Ceibos',
      },
      {
        ...base,
        support_session_id: 's2',
        support_session_status: 'active',
        support_session_ended_at: null,
      },
    ]);
    const items = within(
      screen.getByRole('list', { name: 'Accesos' }),
    ).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Los Ceibos');
    expect(items[0]).toHaveTextContent('Quién: Equipo de Domus');
    expect(items[0]).toHaveTextContent('Como: Marta Soporte');
    expect(items[0]).toHaveTextContent('Motivo: Revisar un acceso');
    expect(items[0]).toHaveTextContent('Finalizada');
    expect(items[0]).toHaveTextContent('Duración: 12 min');
    // An "active" row past its expiry is shown as expired.
    expect(items[1]).toHaveTextContent('Vencida');
  });

  it('says so when empty', () => {
    render([]);
    expect(screen.getByText('Nada')).toBeInTheDocument();
  });

  it('lets the admin end a session that this browser is not acting in', async () => {
    const end = vi.fn().mockResolvedValue({ status: 'success' });
    renderWithIntl(
      <ActiveSupportSession
        sessionId="s1"
        tenantName="Los Ceibos"
        expiresAt="2026-10-10T15:30:00Z"
        end={end}
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Sesión activa' }),
    ).toHaveTextContent('Los Ceibos');
    fireEvent.click(screen.getByRole('button', { name: 'Terminar sesión' }));
    await waitFor(() => expect(end).toHaveBeenCalledWith('s1'));
  });

  it('reports a failure to end it', async () => {
    const end = vi
      .fn()
      .mockResolvedValue({ status: 'error', errors: {}, formError: 'unknown' });
    renderWithIntl(
      <ActiveSupportSession
        sessionId="s1"
        tenantName="X"
        expiresAt="2026-10-10T15:30:00Z"
        end={end}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Terminar sesión' }));
    expect(await screen.findByText(/Algo salió mal/)).toBeInTheDocument();
  });
});
