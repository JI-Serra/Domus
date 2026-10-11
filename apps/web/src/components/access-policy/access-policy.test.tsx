import { policyTemplates } from '@domus/domain/access-policy';
import type { AccessPolicy } from '@domus/domain/access-policy';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import type { PolicyHistoryItem } from '@/lib/access-policy/data';
import { HistoryList } from './history-list';
import { PolicyEditor } from './policy-editor';

const actions = vi.hoisted(() => ({
  saveAccessPolicyAction: vi.fn(),
  applyAccessPolicyTemplateAction: vi.fn(),
}));
vi.mock('@/app/(app)/settings/access-policy/actions', () => actions);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const balanced = (): AccessPolicy => structuredClone(policyTemplates.balanced);

const renderEditor = (
  overrides: Partial<Parameters<typeof PolicyEditor>[0]> = {},
) =>
  renderWithIntl(
    <PolicyEditor
      policy={balanced()}
      appliedTemplate="balanced"
      version="v1"
      canEdit
      {...overrides}
    />,
  );

const row = (name: string) => screen.getByRole('group', { name });

beforeEach(() => {
  vi.clearAllMocks();
  actions.saveAccessPolicyAction.mockResolvedValue({
    status: 'success',
    notice: 'saved',
  });
  actions.applyAccessPolicyTemplateAction.mockResolvedValue({
    status: 'success',
    notice: 'templateApplied',
  });
});

describe('PolicyEditor matrix', () => {
  it('shows every visitor type with the modes of the saved policy', () => {
    renderEditor();
    const list = screen.getByRole('list', {
      name: 'Reglas por tipo de visitante',
    });
    expect(within(list).getAllByRole('group')).toHaveLength(7);
    const delivery = row('Delivery');
    expect(
      within(delivery).getByRole('checkbox', { name: 'Aviso' }),
    ).toBeChecked();
    expect(
      within(delivery).getByRole('checkbox', { name: 'Ingreso directo' }),
    ).not.toBeChecked();
    expect(
      within(delivery).getByRole('combobox', { name: 'Por defecto' }),
    ).toHaveValue('approval');
    expect(
      within(delivery).getByRole('switch', { name: 'Verificar identidad' }),
    ).not.toBeChecked();
    expect(
      within(row('Invitado con pase')).getByRole('switch', {
        name: 'Verificar identidad',
      }),
    ).toBeChecked();
  });

  it('blocks direct entry and notice for an unknown visitor and explains why behind an info button', () => {
    renderEditor();
    const unknown = row('Desconocido');
    expect(
      within(unknown).getByRole('checkbox', { name: 'Ingreso directo' }),
    ).toBeDisabled();
    expect(
      within(unknown).getByRole('checkbox', { name: 'Aviso' }),
    ).toBeDisabled();
    fireEvent.click(
      within(unknown).getByRole('button', {
        name: 'Por qué un desconocido no admite ingreso directo ni aviso',
      }),
    );
    expect(
      within(unknown).getByText(/nunca entra sin que el hogar lo apruebe/),
    ).toBeVisible();
  });

  it('keeps the default among the allowed modes', () => {
    renderEditor();
    const delivery = row('Delivery');
    const select = within(delivery).getByRole('combobox', {
      name: 'Por defecto',
    });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Aviso', 'Aprobación', 'Rechazo']);
    // Switching off the default mode moves the default to a remaining allowed mode.
    fireEvent.click(
      within(delivery).getByRole('checkbox', { name: 'Aprobación' }),
    );
    expect(select).toHaveValue('notify');
    expect(within(select).getAllByRole('option')).toHaveLength(2);
  });

  it('does not let the last allowed mode be switched off', () => {
    renderEditor();
    const unknown = row('Desconocido');
    fireEvent.click(within(unknown).getByRole('checkbox', { name: 'Rechazo' }));
    expect(
      within(unknown).getByRole('checkbox', { name: 'Aprobación' }),
    ).toBeDisabled();
  });

  it('enables saving only after a change, and sends the whole policy with one event id', async () => {
    renderEditor();
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();

    const delivery = row('Delivery');
    fireEvent.change(
      within(delivery).getByRole('combobox', { name: 'Por defecto' }),
      {
        target: { value: 'reject' },
      },
    );
    fireEvent.click(
      within(delivery).getByRole('switch', { name: 'Verificar identidad' }),
    );
    expect(screen.getByText('Hay cambios sin guardar')).toBeVisible();
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(actions.saveAccessPolicyAction).toHaveBeenCalledTimes(1),
    );
    const [sent, eventId] = actions.saveAccessPolicyAction.mock.calls[0] as [
      AccessPolicy,
      string,
    ];
    expect(eventId).toMatch(UUID);
    expect(sent.rules.delivery).toEqual({
      access_policy_rule_allowed_modes: ['notify', 'approval', 'reject'],
      access_policy_rule_default_mode: 'reject',
      access_policy_rule_is_identity_verification_required: true,
    });
    expect(sent.rules.unknown).toEqual(policyTemplates.balanced.rules.unknown);
    expect(await screen.findByText('Reglamento guardado.')).toBeVisible();
  });

  it('reuses the event id when the same change is retried and renews it when the change differs', async () => {
    actions.saveAccessPolicyAction.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'busy',
    });
    renderEditor();
    const delivery = row('Delivery');
    const identity = within(delivery).getByRole('switch', {
      name: 'Verificar identidad',
    });
    fireEvent.click(identity);
    const save = screen.getByRole('button', { name: 'Guardar cambios' });
    fireEvent.click(save);
    await waitFor(() =>
      expect(actions.saveAccessPolicyAction).toHaveBeenCalledTimes(1),
    );
    expect(
      await screen.findByText(
        'Hay otro cambio en curso. Volvé a intentar en unos segundos.',
      ),
    ).toBeVisible();
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() =>
      expect(actions.saveAccessPolicyAction).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(
      within(row('Servicio o trabajador')).getByRole('switch', {
        name: 'Verificar identidad',
      }),
    );
    fireEvent.click(save);
    await waitFor(() =>
      expect(actions.saveAccessPolicyAction).toHaveBeenCalledTimes(3),
    );
    const ids = actions.saveAccessPolicyAction.mock.calls.map(
      (call) => call[1],
    );
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('discards the draft', () => {
    renderEditor();
    const delivery = row('Delivery');
    const identity = within(delivery).getByRole('switch', {
      name: 'Verificar identidad',
    });
    fireEvent.click(identity);
    expect(identity).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
    expect(identity).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
  });

  it('starts again from the saved policy when it changes', () => {
    function Harness() {
      const [saved, setSaved] = useState<AccessPolicy>(balanced());
      return (
        <>
          <button
            type="button"
            onClick={() => {
              const next = balanced();
              next.rules.delivery.access_policy_rule_is_identity_verification_required = true;
              setSaved(next);
            }}
          >
            Refrescar
          </button>
          <PolicyEditor
            policy={saved}
            appliedTemplate={null}
            version={JSON.stringify(saved)}
            canEdit
          />
        </>
      );
    }
    renderWithIntl(<Harness />);
    const identity = within(row('Delivery')).getByRole('switch', {
      name: 'Verificar identidad',
    });
    fireEvent.click(
      within(row('Invitado de evento')).getByRole('switch', {
        name: 'Verificar identidad',
      }),
    );
    expect(screen.getByText('Hay cambios sin guardar')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(identity).toBeChecked();
    expect(
      screen.queryByText('Hay cambios sin guardar'),
    ).not.toBeInTheDocument();
  });
});

describe('PolicyEditor limits', () => {
  it('shows the saved limits and the bounds of the domain when a value is out of range', () => {
    renderEditor();
    const timeout = screen.getByLabelText('Tiempo de espera de aprobación');
    expect(timeout).toHaveValue('90');
    fireEvent.change(timeout, { target: { value: '301' } });
    expect(
      screen.getByText('Ingresá un número entero entre 30 y 300.'),
    ).toBeVisible();
    expect(timeout).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Corregí los campos marcados para guardar.'),
    ).toBeVisible();

    fireEvent.change(timeout, { target: { value: '30' } });
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeEnabled();
    fireEvent.change(timeout, { target: { value: '29' } });
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
  });

  it.each([
    ['Vigencia máxima de una autorización permanente', '3651', '1 y 3650'],
    ['Usos máximos de un pase', '0', '1 y 100'],
    ['Duración máxima de un pase', '366', '1 y 365'],
    ['Invitados máximos por evento', '1001', '1 y 1000'],
  ])('rejects %s = %s', (label, value, range) => {
    renderEditor();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect(
      screen.getByText(`Ingresá un número entero entre ${range}.`),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled();
  });

  it('rejects text and decimals', () => {
    renderEditor();
    const uses = screen.getByLabelText('Usos máximos de un pase');
    for (const value of ['', 'abc', '2.5']) {
      fireEvent.change(uses, { target: { value } });
      expect(
        screen.getByRole('button', { name: 'Guardar cambios' }),
      ).toBeDisabled();
    }
  });
});

describe('PolicyEditor templates', () => {
  it('previews a template as a diff against the saved policy before applying it', async () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los cambios de la plantilla Flexible',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Plantilla Flexible' });
    const changes = within(sheet).getByRole('list', {
      name: 'Cambios de la plantilla',
    });
    expect(changes).toHaveTextContent('Tiempo de espera de aprobación');
    expect(changes).toHaveTextContent('90 s');
    expect(changes).toHaveTextContent('60 s');
    expect(changes).toHaveTextContent(
      'Invitado con pase · Verificación de identidad',
    );
    expect(changes).toHaveTextContent('Requerida');
    // Nothing is saved by looking at it.
    expect(actions.applyAccessPolicyTemplateAction).not.toHaveBeenCalled();

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Aplicar plantilla' }),
    );
    await waitFor(() =>
      expect(actions.applyAccessPolicyTemplateAction).toHaveBeenCalledTimes(1),
    );
    const [code, eventId] = actions.applyAccessPolicyTemplateAction.mock
      .calls[0] as [string, string];
    expect(code).toBe('flexible');
    expect(eventId).toMatch(UUID);
    await waitFor(() => expect(sheet).not.toHaveAttribute('open'));
    expect(await screen.findByText('Plantilla aplicada.')).toBeVisible();
  });

  it('lists every field the strict template changes, with before and after', () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los cambios de la plantilla Estricto',
      }),
    );
    const changes = within(
      screen.getByRole('dialog', { name: 'Plantilla Estricto' }),
    ).getByRole('list', { name: 'Cambios de la plantilla' });
    const items = within(changes).getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(8);
    const timeout = items.find((item) =>
      item.textContent?.includes('Tiempo de espera de aprobación'),
    );
    expect(timeout).toHaveTextContent('90 s');
    expect(timeout).toHaveTextContent('120 s');
    const permanent = items.find((item) =>
      item.textContent?.includes('Autorizado permanente · Modos permitidos'),
    );
    expect(permanent).toHaveTextContent('Ingreso directo, Aviso, Aprobación');
    expect(permanent).toHaveTextContent('Aviso, Aprobación');
  });

  it('says so when a template changes nothing and does not offer to apply the one already in force', () => {
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los cambios de la plantilla Equilibrado',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Plantilla Equilibrado' });
    expect(within(sheet).getByText('No cambia ningún valor.')).toBeVisible();
    expect(
      within(sheet).getByRole('button', { name: 'Aplicar plantilla' }),
    ).toBeDisabled();
  });

  it('warns that unsaved edits are discarded', () => {
    renderEditor();
    fireEvent.click(
      within(row('Delivery')).getByRole('switch', {
        name: 'Verificar identidad',
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los cambios de la plantilla Estricto',
      }),
    );
    expect(
      within(
        screen.getByRole('dialog', { name: 'Plantilla Estricto' }),
      ).getByText('Tus cambios sin guardar se descartan.'),
    ).toBeVisible();
  });

  it('shows the error inside the sheet when applying fails, and keeps it open', async () => {
    actions.applyAccessPolicyTemplateAction.mockResolvedValue({
      status: 'error',
      errors: {},
      formError: 'denied',
    });
    renderEditor();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Ver los cambios de la plantilla Flexible',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'Plantilla Flexible' });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Aplicar plantilla' }),
    );
    expect(
      await within(sheet).findByText(
        'No tenés permiso para cambiar el reglamento.',
      ),
    ).toBeVisible();
    expect(sheet).toHaveAttribute('open');
  });

  it('labels the template in force, or a hand-made policy as custom', () => {
    const { unmount } = renderEditor();
    expect(screen.getByText('Aplicada: Equilibrado')).toBeVisible();
    unmount();
    renderEditor({ appliedTemplate: null });
    expect(screen.getByText('Personalizado')).toBeVisible();
  });
});

describe('PolicyEditor read-only', () => {
  it('disables every control and offers no save or templates', () => {
    renderEditor({ canEdit: false, appliedTemplate: undefined });
    expect(screen.getByText('Solo lectura')).toBeVisible();
    for (const box of screen.getAllByRole('checkbox'))
      expect(box).toBeDisabled();
    for (const select of screen.getAllByRole('combobox'))
      expect(select).toBeDisabled();
    for (const toggle of screen.getAllByRole('switch'))
      expect(toggle).toBeDisabled();
    for (const input of screen.getAllByRole('textbox'))
      expect(input).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).toBeNull();
    expect(
      screen.queryByRole('list', { name: 'Plantillas del reglamento' }),
    ).toBeNull();
    expect(screen.queryByText('Personalizado')).toBeNull();
  });
});

describe('HistoryList', () => {
  const entry = (
    overrides: Partial<PolicyHistoryItem> = {},
  ): PolicyHistoryItem => ({
    eventId: 'e1',
    occurredAt: '2026-10-11T15:30:00Z',
    actorUserId: 'u1',
    onBehalfOfUserId: null,
    isSupport: false,
    appliedTemplate: null,
    changes: [
      {
        path: 'rules.delivery.access_policy_rule_default_mode',
        before: 'approval',
        after: 'notify',
      },
      {
        path: 'access_policy_pass_max_uses_count',
        before: 10,
        after: 1,
      },
    ],
    ...overrides,
  });

  it('shows who, when, how and each change before → after', () => {
    renderWithIntl(
      <HistoryList
        items={[
          entry(),
          entry({ eventId: 'e2', appliedTemplate: 'strict', changes: [] }),
        ]}
        names={{ u1: 'Alma Administradora' }}
        timeZone="America/Argentina/Tucuman"
      />,
    );
    const list = screen.getByRole('list', { name: 'Cambios del reglamento' });
    const [manual, template] = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list);
    expect(manual).toHaveTextContent('11/10/2026 12:30');
    expect(manual).toHaveTextContent('Manual');
    expect(manual).toHaveTextContent('Alma Administradora');
    expect(manual).toHaveTextContent('Delivery · Por defecto');
    expect(manual).toHaveTextContent('Aprobación');
    expect(manual).toHaveTextContent('Aviso');
    expect(manual).toHaveTextContent('Usos máximos de un pase');
    expect(manual).toHaveTextContent('10 usos');
    expect(manual).toHaveTextContent('1 uso');
    expect(template).toHaveTextContent('Plantilla Estricto');
    expect(template).toHaveTextContent('No cambió ningún valor.');
  });

  it('names a support entry as the Domus team acting for the user', () => {
    renderWithIntl(
      <HistoryList
        items={[entry({ isSupport: true, onBehalfOfUserId: 'u2' })]}
        names={{ u2: 'Ana Admin' }}
        timeZone="America/Argentina/Tucuman"
      />,
    );
    expect(screen.getByText('Equipo de Domus como Ana Admin')).toBeVisible();
  });

  it('falls back to a role when the name is not readable, and shows an empty state', () => {
    const { unmount } = renderWithIntl(
      <HistoryList
        items={[entry()]}
        names={{}}
        timeZone="America/Argentina/Tucuman"
      />,
    );
    expect(screen.getByText('Administrador del barrio')).toBeVisible();
    unmount();
    renderWithIntl(
      <HistoryList
        items={[]}
        names={{}}
        timeZone="America/Argentina/Tucuman"
      />,
    );
    expect(screen.getByText('Todavía no hay cambios')).toBeVisible();
  });
});
