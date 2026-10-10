import { fireEvent, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { Badge, StatusBadge } from './badge';
import type { StatusTone } from './badge';
import { Button } from './button';
import { Card } from './card';
import { EmptyState } from './empty-state';
import { Field, Input, Select } from './field';
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
    <Field
      label="Patente"
      hint="Seis o siete caracteres."
      error="Revisá la patente."
    >
      <Input />
    </Field>,
  );
  const input = screen.getByLabelText('Patente');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription(
    'Seis o siete caracteres. Revisá la patente.',
  );
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

it('Switch exposes switch semantics with a description', () => {
  const onChange = vi.fn();
  renderWithIntl(
    <Switch
      label="Modo garita"
      description="Más grande."
      checked={false}
      onChange={onChange}
    />,
  );
  const toggle = screen.getByRole('switch', { name: 'Modo garita' });
  expect(toggle).toHaveAccessibleDescription('Más grande.');
  fireEvent.click(toggle);
  expect(onChange).toHaveBeenCalled();
});
