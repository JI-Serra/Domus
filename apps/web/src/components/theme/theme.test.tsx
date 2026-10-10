import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test/render';
import { ThemeControls } from './theme-controls';
import {
  THEME_INIT_SCRIPT,
  applyThemePreference,
  parseThemeChoice,
  resetThemeStoreForTests,
  setThemePreference,
} from './theme-store';

const html = document.documentElement;

beforeEach(() => {
  setThemePreference({ theme: 'system', gate: false });
  localStorage.clear();
  resetThemeStoreForTests();
});

describe('theme store', () => {
  it('parses unknown values as system', () => {
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('sepia')).toBe('system');
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice(undefined)).toBe('system');
  });

  it('applies and clears the document attributes', () => {
    applyThemePreference({ theme: 'dark', gate: true });
    expect(html).toHaveAttribute('data-theme', 'dark');
    expect(html).toHaveAttribute('data-mode', 'gate');
    applyThemePreference({ theme: 'system', gate: false });
    expect(html).not.toHaveAttribute('data-theme');
    expect(html).not.toHaveAttribute('data-mode');
  });

  it('persists the preference per browser', () => {
    setThemePreference({ theme: 'light', gate: true });
    expect(localStorage.getItem('domus.theme')).toBe('light');
    expect(localStorage.getItem('domus.gate')).toBe('1');
    setThemePreference({ theme: 'system', gate: false });
    expect(localStorage.getItem('domus.theme')).toBeNull();
    expect(localStorage.getItem('domus.gate')).toBeNull();
  });

  it('the pre-paint script restores the saved preference like applyThemePreference does', () => {
    localStorage.setItem('domus.theme', 'dark');
    localStorage.setItem('domus.gate', '1');
    new Function(THEME_INIT_SCRIPT)();
    expect(html).toHaveAttribute('data-theme', 'dark');
    expect(html).toHaveAttribute('data-mode', 'gate');
  });

  it('the pre-paint script ignores invalid values', () => {
    localStorage.setItem('domus.theme', 'sepia');
    new Function(THEME_INIT_SCRIPT)();
    expect(html).not.toHaveAttribute('data-theme');
  });
});

describe('ThemeControls', () => {
  it('toggles gate mode when the visible switch track is clicked', () => {
    const { container } = renderWithIntl(<ThemeControls />);
    const track = container.querySelector('span[aria-hidden="true"]');
    expect(track).not.toBeNull();

    fireEvent.click(track as Element);
    expect(html).toHaveAttribute('data-mode', 'gate');
    expect(screen.getByRole('switch', { name: 'Modo garita' })).toBeChecked();

    fireEvent.click(track as Element);
    expect(html).not.toHaveAttribute('data-mode');
    expect(
      screen.getByRole('switch', { name: 'Modo garita' }),
    ).not.toBeChecked();
  });

  it('switches theme and gate mode, updating <html>', () => {
    renderWithIntl(<ThemeControls />);
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(html).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked();

    fireEvent.click(screen.getByRole('switch', { name: 'Modo garita' }));
    expect(html).toHaveAttribute('data-mode', 'gate');
    expect(screen.getByRole('switch', { name: 'Modo garita' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Sistema' }));
    expect(html).not.toHaveAttribute('data-theme');
    expect(html).toHaveAttribute('data-mode', 'gate');
  });
});
