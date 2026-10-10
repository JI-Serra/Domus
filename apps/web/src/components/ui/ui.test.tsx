import { fireEvent, screen, within } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { Badge, StatusBadge } from './badge';
import type { StatusTone } from './badge';
import { Button } from './button';
import { Card } from './card';
import { EmptyState } from './empty-state';
import { Field, Input, Select } from './field';
import { InfoButton } from './info-button';
import { SegmentedControl } from './segmented-control';
import { SemaphorePanel } from './semaphore-panel';
import { Switch } from './switch';

it('Button defaults to type=button, fires onClick and honors disabled', () => {
  const onClick = vi.fn();
  renderWithIntl(
    <>
      <Button onClick={onClick}>Registrar ingreso</Button>
      <Button disabled>No disponible</Button>
    </>,
  );
  const button = screen.getByRole('button', { name: 'Registrar ingreso' });
  expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'No disponible' })).toBeDisabled();
});

it('Button sizes map to the touch tokens (44 px adaptive, 56 px gate, 64 px panel)', () => {
  renderWithIntl(
    <>
      <Button size="md">md</Button>
      <Button size="gate">gate</Button>
      <Button size="panel">panel</Button>
      <Button size="icon" aria-label="Agregar">
        <Plus aria-hidden="true" />
      </Button>
    </>,
  );
  expect(screen.getByRole('button', { name: 'md' })).toHaveClass(
    'min-h-(--control-height)',
  );
  expect(screen.getByRole('button', { name: 'gate' })).toHaveClass(
    'min-h-(--touch-garita)',
  );
  expect(screen.getByRole('button', { name: 'panel' })).toHaveClass(
    'min-h-(--touch-primary-action)',
    'w-full',
  );
  expect(screen.getByRole('button', { name: 'Agregar' })).toHaveClass(
    'size-(--control-height)',
  );
});

it('Field links the label, hint and error to the input', () => {
  renderWithIntl(
    <Field label="Patente" error="Revisá la patente.">
      <Input />
    </Field>,
  );
  const input = screen.getByLabelText('Patente');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Revisá la patente.');
});

it('Field without an error leaves the input valid, and works with Select', () => {
  renderWithIntl(
    <Field label="Tipo">
      <Select defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    </Field>,
  );
  const select = screen.getByLabelText('Tipo');
  expect(select).not.toHaveAttribute('aria-invalid');
  expect(select).toHaveValue('b');
});

it('Input and Select work outside a Field', () => {
  renderWithIntl(
    <>
      <Input aria-label="suelto" />
      <Select aria-label="lista">
        <option>x</option>
      </Select>
    </>,
  );
  expect(screen.getByLabelText('suelto')).toHaveAttribute('type', 'text');
  expect(screen.getByLabelText('lista')).toBeInTheDocument();
});

it.each<StatusTone>(['success', 'warning', 'danger', 'info', 'offline'])(
  'StatusBadge %s shows text and an icon, never color alone',
  (status) => {
    const { container } = renderWithIntl(
      <StatusBadge status={status}>Estado</StatusBadge>,
    );
    expect(screen.getByText('Estado')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  },
);

it('Badge renders its tone and optional icon', () => {
  const { container } = renderWithIntl(<Badge tone="ember">Nuevo</Badge>);
  expect(screen.getByText('Nuevo')).toHaveClass('text-ember');
  expect(container.querySelector('svg')).toBeNull();
});

it('Card uses the 28 px radius by default and 16 px when dense', () => {
  renderWithIntl(
    <>
      <Card data-testid="a">a</Card>
      <Card data-testid="b" density="dense" tone="base">
        b
      </Card>
    </>,
  );
  expect(screen.getByTestId('a')).toHaveClass('rounded-card');
  expect(screen.getByTestId('b')).toHaveClass(
    'rounded-card-dense',
    'bg-surface-0',
  );
});

it('EmptyState shows icon, title, description and action', () => {
  const { container } = renderWithIntl(
    <EmptyState
      icon={Plus}
      title="Sin pases"
      description="Creá uno."
      action={<Button>Crear</Button>}
    />,
  );
  expect(
    screen.getByRole('heading', { name: 'Sin pases', level: 2 }),
  ).toBeInTheDocument();
  expect(screen.getByText('Creá uno.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
});

it.each([
  ['green', 'status'],
  ['yellow', 'status'],
  ['red', 'alert'],
] as const)(
  'SemaphorePanel %s shows result, reason, rule and authorizer (role %s)',
  (decision, role) => {
    const { container } = renderWithIntl(
      <SemaphorePanel
        decision={decision}
        result="Resultado"
        reason="Motivo del resultado"
        ruleName="Regla de ejemplo"
        authorizedBy="Marta Giménez"
      >
        <Button size="panel">Registrar ingreso</Button>
      </SemaphorePanel>,
    );
    const panel = screen.getByRole(role);
    expect(panel).toHaveAttribute('data-decision', decision);
    expect(panel).toHaveTextContent('Resultado');
    expect(panel).toHaveTextContent('Motivo del resultado');
    expect(panel).toHaveTextContent('Regla aplicada');
    expect(panel).toHaveTextContent('Regla de ejemplo');
    expect(panel).toHaveTextContent('Autorizó');
    expect(panel).toHaveTextContent('Marta Giménez');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(panel).toHaveClass('min-h-[50dvh]');
    expect(
      screen.getByRole('button', { name: 'Registrar ingreso' }),
    ).toBeInTheDocument();
  },
);

it('SemaphorePanel can be compact and silent for static previews', () => {
  const { container } = renderWithIntl(
    <SemaphorePanel
      decision="green"
      result="Permitido"
      reason="r"
      ruleName="n"
      authorizedBy="a"
      fill={false}
      live={false}
    />,
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(container.firstElementChild).not.toHaveClass('min-h-[50dvh]');
});

it('SegmentedControl reports the chosen option', () => {
  const onChange = vi.fn();
  renderWithIntl(
    <SegmentedControl
      legend="Tema"
      value="light"
      onChange={onChange}
      options={[
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' },
      ]}
    />,
  );
  expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
  expect(onChange).toHaveBeenCalledWith('dark');
});

it('Switch exposes switch semantics and reports changes', () => {
  const onChange = vi.fn();
  renderWithIntl(
    <Switch label="Modo garita" checked={false} onChange={onChange} />,
  );
  const toggle = screen.getByRole('switch', { name: 'Modo garita' });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('Switch toggles when the visible track or the text is clicked, not only the hidden input', () => {
  function Controlled() {
    const [on, setOn] = useState(false);
    return (
      <Switch
        label="Modo garita"
        checked={on}
        onChange={(event) => setOn(event.target.checked)}
      />
    );
  }
  const { container } = renderWithIntl(<Controlled />);
  const toggle = screen.getByRole('switch', { name: 'Modo garita' });
  const track = container.querySelector('span[aria-hidden="true"]');
  expect(track).not.toBeNull();
  // The track is inside the same <label> as the input, so a click on it reaches the input.
  expect(track?.closest('label')).toBe(toggle.closest('label'));

  fireEvent.click(track as Element);
  expect(toggle).toBeChecked();
  fireEvent.click(screen.getByText('Modo garita'));
  expect(toggle).not.toBeChecked();
});

it('Field shows its help behind an info button instead of permanent text', () => {
  renderWithIntl(
    <Field
      label="Contraseña"
      info={{ label: 'Más información', text: 'Ocho o más.' }}
    >
      <Input />
    </Field>,
  );
  expect(screen.queryByText('Ocho o más.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Más información' }));
  expect(screen.getByText('Ocho o más.')).toBeInTheDocument();
});

it('InfoButton opens on click, names its popover, and closes on Escape and outside press', () => {
  renderWithIntl(
    <>
      <InfoButton label="Más información: colores">
        Valor vivo del tema.
      </InfoButton>
      <button type="button">Afuera</button>
    </>,
  );
  const trigger = screen.getByRole('button', {
    name: 'Más información: colores',
  });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveClass('size-(--control-height)');
  expect(screen.queryByText('Valor vivo del tema.')).toBeNull();

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popover = screen.getByRole('group', {
    name: 'Más información: colores',
  });
  expect(within(popover).getByText('Valor vivo del tema.')).toBeInTheDocument();
  expect(trigger).toHaveAttribute('aria-controls', popover.id);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByText('Valor vivo del tema.')).toBeNull();
  expect(trigger).toHaveFocus();

  fireEvent.click(trigger);
  expect(screen.getByText('Valor vivo del tema.')).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Afuera' }));
  expect(screen.queryByText('Valor vivo del tema.')).toBeNull();

  // The same button toggles it closed again.
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(screen.queryByText('Valor vivo del tema.')).toBeNull();
});
