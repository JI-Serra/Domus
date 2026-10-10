'use client';

import { useSyncExternalStore } from 'react';
import {
  getServerThemePreference,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from './theme-store';
import type { ThemeChoice, ThemePreference } from './theme-store';

export function useThemePreference(): {
  preference: ThemePreference;
  setTheme: (theme: ThemeChoice) => void;
  setGate: (gate: boolean) => void;
} {
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    getThemePreference,
    getServerThemePreference,
  );
  return {
    preference,
    setTheme: (theme) => setThemePreference({ ...preference, theme }),
    setGate: (gate) => setThemePreference({ ...preference, gate }),
  };
}
