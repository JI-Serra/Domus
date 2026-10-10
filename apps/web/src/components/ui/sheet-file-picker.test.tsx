import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { FilePicker } from './file-picker';
import { Sheet } from './sheet';

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Sheet
        open={open}
        title="Agregar miembro"
        closeLabel="Cerrar"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <input aria-label="Nombre" />
      </Sheet>
    </>
  );
}

it('Sheet shows its title and content as a modal dialog and closes with the button, Escape and the backdrop', () => {
  const onClose = vi.fn();
  renderWithIntl(<Harness onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'Agregar miembro' });
  expect(dialog).toHaveAttribute('open');
  expect(within(dialog).getByLabelText('Nombre')).toBeVisible();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dialog).not.toHaveAttribute('open');

  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(dialog).toHaveAttribute('open');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(onClose).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  // A press on the backdrop targets the dialog itself; a press on the content does not close it.
  fireEvent.click(within(dialog).getByLabelText('Nombre'));
  expect(onClose).toHaveBeenCalledTimes(2);
  fireEvent.click(dialog);
  expect(onClose).toHaveBeenCalledTimes(3);
});

it('Sheet mounts its content only while open, so each opening starts clean', () => {
  renderWithIntl(<Harness />);
  const dialog = screen.getByRole('dialog', { name: 'Agregar miembro' });
  fireEvent.change(within(dialog).getByLabelText('Nombre'), {
    target: { value: 'Ana' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(screen.getByLabelText('Nombre')).toHaveValue('');
});

it('FilePicker speaks the caller language, reports the chosen file and clears it', () => {
  const onChange = vi.fn();
  const { container, rerender } = render(
    <FilePicker
      accept="image/png"
      chooseLabel="Elegir foto"
      emptyLabel="Sin foto"
      clearLabel="Quitar la foto"
      onChange={onChange}
    />,
  );
  expect(screen.getByText('Sin foto')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Quitar la foto' }),
  ).not.toBeInTheDocument();

  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const click = vi.spyOn(input, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Elegir foto' }));
  expect(click).toHaveBeenCalled();

  const file = new File(['x'], 'luna.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
  expect(onChange).toHaveBeenCalledWith(file);

  rerender(
    <FilePicker
      accept="image/png"
      chooseLabel="Elegir foto"
      emptyLabel="Sin foto"
      clearLabel="Quitar la foto"
      fileName="luna.png"
      onChange={onChange}
    />,
  );
  expect(screen.getByText('luna.png')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Quitar la foto' }));
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it('FilePicker is disabled as a whole while busy', () => {
  render(
    <FilePicker
      accept="image/png"
      chooseLabel="Elegir foto"
      emptyLabel="Sin foto"
      clearLabel="Quitar la foto"
      fileName="luna.png"
      disabled
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Quitar la foto' })).toBeDisabled();
});
