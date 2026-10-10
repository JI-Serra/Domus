import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import HomePage from './page';

it('renders the Domus heading inside the main landmark', () => {
  render(<HomePage />);
  expect(screen.getByRole('main')).toContainElement(
    screen.getByRole('heading', { name: 'Domus', level: 1 }),
  );
});
