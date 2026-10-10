/**
 * Per-browser theme preference: color theme (`system` follows `prefers-color-scheme`) and "modo garita".
 * Persisted in localStorage and applied as `data-theme` / `data-mode` on <html>, which the generated token CSS keys on.
 */

export type ThemeChoice = 'system' | 'light' | 'dark';

export interface ThemePreference {
  theme: ThemeChoice;
  gate: boolean;
}

export const THEME_STORAGE_KEY = 'domus.theme';
export const GATE_STORAGE_KEY = 'domus.gate';

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  theme: 'system',
  gate: false,
};

export function parseThemeChoice(
  value: string | null | undefined,
): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (preference.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference.theme);

  if (preference.gate) root.setAttribute('data-mode', 'gate');
  else root.removeAttribute('data-mode');
}

/**
 * Runs before first paint (inline in <head>) so the saved theme never flashes. Keep it in sync with
 * {@link applyThemePreference}; the test suite executes both and compares the result.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')d.setAttribute('data-theme',t);if(localStorage.getItem('${GATE_STORAGE_KEY}')==='1')d.setAttribute('data-mode','gate');}catch(e){}})();`;

type Listener = () => void;

const listeners = new Set<Listener>();
let cached: ThemePreference | null = null;

function readStored(): ThemePreference {
  try {
    return {
      theme: parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY)),
      gate: localStorage.getItem(GATE_STORAGE_KEY) === '1',
    };
  } catch {
    // Private windows or blocked storage: fall back to the defaults.
    return DEFAULT_THEME_PREFERENCE;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (
    event.key !== null &&
    event.key !== THEME_STORAGE_KEY &&
    event.key !== GATE_STORAGE_KEY
  )
    return;
  cached = null;
  applyThemePreference(getThemePreference());
  notify();
}

/** Stable snapshot for `useSyncExternalStore` (same object until the preference changes). */
export function getThemePreference(): ThemePreference {
  cached ??= readStored();
  return cached;
}

export function getServerThemePreference(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

export function setThemePreference(preference: ThemePreference): void {
  cached = preference;
  try {
    if (preference.theme === 'system')
      localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference.theme);
    if (preference.gate) localStorage.setItem(GATE_STORAGE_KEY, '1');
    else localStorage.removeItem(GATE_STORAGE_KEY);
  } catch {
    // Storage is a convenience: the in-memory preference and the document attributes still apply.
  }
  applyThemePreference(preference);
  notify();
}

export function subscribeThemePreference(listener: Listener): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/** Test helper: forget the cached snapshot. */
export function resetThemeStoreForTests(): void {
  cached = null;
}
