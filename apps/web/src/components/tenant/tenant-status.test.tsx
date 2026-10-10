import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { TenantCancelled } from './tenant-cancelled';
import {
  TenantStatusProvider,
  useTenantStatus,
  useTenantWritable,
} from './tenant-status';

function Probe() {
  return (
    <p data-testid="probe">
      {String(useTenantStatus())}:{String(useTenantWritable())}
    </p>
  );
}

describe('useTenantWritable', () => {
  it.each([
    ['pilot', 'pilot:true'],
    ['active', 'active:true'],
    ['suspended', 'suspended:false'],
    ['cancelled', 'cancelled:false'],
    // The platform area has no tenant, so no subscription limits it.
    [null, 'null:true'],
  ] as const)('%s → %s', (status, expected) => {
    render(
      <TenantStatusProvider status={status}>
        <Probe />
      </TenantStatusProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent(expected);
  });

  it('fails loudly when nobody provided the status, so a write control is never silently enabled', () => {
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/TenantStatusProvider/);
    quiet.mockRestore();
  });
});

describe('TenantCancelled', () => {
  it('tells the user the service is down, with nothing to act on', () => {
    renderWithIntl(<TenantCancelled />);
    expect(
      screen.getByRole('heading', {
        name: 'El servicio de este barrio está dado de baja',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
