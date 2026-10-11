import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyJoinRequest } from '@/lib/household/join-rpc';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { renderWithIntl } from '@/test/render';

const submit =
  vi.fn<
    (previous: PlatformFormState, data: FormData) => Promise<PlatformFormState>
  >();
const cancel = vi.fn<(id: string) => Promise<PlatformFormState>>();
vi.mock('@/app/(account)/join/actions', () => ({
  submitJoinRequestAction: (previous: PlatformFormState, data: FormData) =>
    submit(previous, data),
  cancelJoinRequestAction: (id: string) => cancel(id),
}));

const { JoinForm } = await import('./join-form');
const { MyJoinRequests } = await import('./my-requests');

beforeEach(() => {
  vi.clearAllMocks();
  submit.mockResolvedValue({ status: 'success', notice: 'sent' });
  cancel.mockResolvedValue({ status: 'success', notice: 'cancelled' });
});

const fill = (code = 'abcd efgh jkmn') => {
  fireEvent.change(screen.getByLabelText('Código de unidad'), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: 'Ana' },
  });
  fireEvent.change(screen.getByLabelText('Apellido'), {
    target: { value: 'Gómez' },
  });
};

describe('JoinForm (D22)', () => {
  it('formats a pasted code as 4-4-4 in upper case, whatever the separators', () => {
    renderWithIntl(<JoinForm />);
    const input = screen.getByLabelText('Código de unidad');
    fireEvent.change(input, { target: { value: ' abcd efgh jkmn ' } });
    expect(input).toHaveValue('ABCD-EFGH-JKMN');
    fireEvent.change(input, { target: { value: 'abcd-efgh-jkmnXYZ' } });
    expect(input).toHaveValue('ABCD-EFGH-JKMN');
    fireEvent.change(input, { target: { value: 'abcde' } });
    expect(input).toHaveValue('ABCD-E');
  });

  it('keeps the explanation behind an info button and shows the short privacy notice', () => {
    renderWithIntl(<JoinForm />);
    expect(
      screen.getByText('Tus datos se usan solo para la gestión de tu barrio.'),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Más información sobre el código' }),
    );
    expect(screen.getByText(/12 caracteres, en grupos de 4/)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Más información sobre la privacidad',
      }),
    );
    expect(screen.getByText(/Ley 25.326/)).toBeVisible();
  });

  it('sends the code with the minimum data and one key, then shows the status', async () => {
    renderWithIntl(<JoinForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(
      await screen.findByRole('heading', { name: 'Solicitud enviada' }),
    ).toBeVisible();
    expect(screen.getByText('Pendiente de aprobación')).toBeVisible();
    const [, data] = submit.mock.calls[0] ?? [];
    expect(data?.get('join_code')).toBe('ABCD-EFGH-JKMN');
    expect(data?.get('person_first_name')).toBe('Ana');
    expect(data?.get('client_event_id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByLabelText('Código de unidad')).not.toBeInTheDocument();
  });

  it('shows the same uniform message for any code the server does not accept and keeps the typing', async () => {
    submit.mockResolvedValue({
      status: 'error',
      errors: { join_code: 'codeUnavailable' },
      values: { person_first_name: 'Ana', person_last_name: 'Gómez' },
    });
    renderWithIntl(<JoinForm />);
    fill('zzzz zzzz zzzz');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    const message =
      'No pudimos usar ese código. Revisalo y volvé a intentar en unos minutos.';
    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByLabelText('Código de unidad')).toHaveValue(
      'ZZZZ-ZZZZ-ZZZZ',
    );
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
  });

  it('shows field errors for the name and an incomplete document', async () => {
    submit.mockResolvedValue({
      status: 'error',
      errors: {
        person_first_name: 'firstNameRequired',
        person_document_number: 'documentIncomplete',
      },
    });
    renderWithIntl(<JoinForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByText('Escribí tu nombre.')).toBeVisible();
    expect(
      screen.getByText(/Completá el tipo y el número de documento/),
    ).toBeVisible();
  });

  it('offers to send another request and starts a new one with a new key', async () => {
    renderWithIntl(<JoinForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enviar otra solicitud' }),
    );
    expect(screen.getByLabelText('Código de unidad')).toHaveValue('');
    fill('wxyz wxyz wxyz');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    const keys = submit.mock.calls.map(([, data]) =>
      data.get('client_event_id'),
    );
    expect(keys[0]).not.toBe(keys[1]);
  });
});

const requests: MyJoinRequest[] = [
  {
    unit_join_request_id: 'q1',
    unit_join_request_status: 'pending',
    unit_join_request_created_at: '2026-10-09T10:00:00Z',
    tenant_name: 'Barrio Los Ceibos',
    unit_code: 'Mz 1 Lote 1',
  },
  {
    unit_join_request_id: 'q2',
    unit_join_request_status: 'approved',
    unit_join_request_created_at: '2026-10-08T10:00:00Z',
    tenant_name: 'Barrio Las Tipas',
    unit_code: 'Mz 2 Lote 3',
  },
  {
    unit_join_request_id: 'q3',
    unit_join_request_status: 'cancelled',
    unit_join_request_created_at: '2026-10-07T10:00:00Z',
    tenant_name: 'Barrio Las Tipas',
    unit_code: 'Mz 2 Lote 4',
  },
];

describe('MyJoinRequests', () => {
  it('renders nothing without requests', () => {
    const { container } = renderWithIntl(<MyJoinRequests requests={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists the requests with their status as text and only a pending one can be cancelled', () => {
    renderWithIntl(<MyJoinRequests requests={requests} />);
    const rows = within(
      screen.getByRole('list', { name: 'Tus solicitudes de ingreso' }),
    ).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement).getByText(
        'Barrio Los Ceibos · Mz 1 Lote 1',
      ),
    ).toBeVisible();
    expect(within(rows[0] as HTMLElement).getByText('Pendiente')).toBeVisible();
    expect(within(rows[1] as HTMLElement).getByText('Aprobada')).toBeVisible();
    expect(
      within(rows[1] as HTMLElement).getByText(/te enviamos la invitación/),
    ).toBeVisible();
    expect(within(rows[2] as HTMLElement).getByText('Cancelada')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: /^Cancelar la solicitud/ }),
    ).toHaveLength(1);
  });

  it('cancels only after confirming', async () => {
    renderWithIntl(<MyJoinRequests requests={requests} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancelar la solicitud a Barrio Los Ceibos · Mz 1 Lote 1',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Cancelar la solicitud',
      hidden: true,
    });
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Cancelar solicitud',
        hidden: true,
      }),
    );
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('q1'));
  });

  it('says so when the cancellation fails', async () => {
    cancel.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'cancelFailed',
    });
    renderWithIntl(<MyJoinRequests requests={requests} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Cancelar la solicitud a Barrio Los Ceibos · Mz 1 Lote 1',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('dialog', { name: 'Cancelar la solicitud' }),
      ).getByRole('button', { name: 'Cancelar solicitud' }),
    );
    expect(
      await screen.findByText(
        'No pudimos cancelar la solicitud. Volvé a intentar.',
      ),
    ).toBeVisible();
  });
});
