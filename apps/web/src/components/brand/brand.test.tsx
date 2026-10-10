import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test/render';
import {
  EMBLEM_PATH,
  EMBLEM_VIEW_BOX,
  LOGO_PATH,
  LOGO_VIEW_BOX,
} from './brand-paths';
import { Emblem } from './emblem';
import { Logo } from './logo';

describe('Emblem', () => {
  it('is an image named "Domus" that paints with the text color', () => {
    renderWithIntl(<Emblem />);
    const emblem = screen.getByRole('img', { name: 'Domus' });
    expect(emblem).toHaveAttribute('fill', 'currentColor');
    expect(emblem).toHaveAttribute('viewBox', EMBLEM_VIEW_BOX);
    expect(emblem.querySelector('path')).toHaveAttribute('d', EMBLEM_PATH);
  });

  it('can be hidden from assistive technology when "Domus" is already said next to it', () => {
    const { container } = renderWithIntl(<Emblem decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('takes its size from the caller', () => {
    renderWithIntl(<Emblem className="h-12" />);
    expect(screen.getByRole('img', { name: 'Domus' })).toHaveClass('h-12');
  });
});

describe('Logo', () => {
  it('is an image named "Domus" (emblem + traced "omus") that paints with the text color', () => {
    renderWithIntl(<Logo />);
    const logo = screen.getByRole('img', { name: 'Domus' });
    expect(logo).toHaveAttribute('fill', 'currentColor');
    expect(logo).toHaveAttribute('viewBox', LOGO_VIEW_BOX);
    expect(logo.querySelector('path')).toHaveAttribute('d', LOGO_PATH);
  });

  it('is wider than the emblem alone and starts with the same geometry', () => {
    const [, , emblemWidth] = EMBLEM_VIEW_BOX.split(' ').map(Number);
    const [, , logoWidth] = LOGO_VIEW_BOX.split(' ').map(Number);
    expect(logoWidth).toBeGreaterThan((emblemWidth ?? 0) * 3);
    expect(LOGO_PATH.startsWith(EMBLEM_PATH.slice(0, 60))).toBe(true);
  });

  it('can be decorative', () => {
    renderWithIntl(<Logo decorative />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
