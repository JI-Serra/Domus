import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 25 ships an experimental global `localStorage` that shadows jsdom's and is unusable without
// `--localstorage-file`. Replace it with an in-memory Storage so tests behave like a browser.
if (typeof globalThis.localStorage?.clear !== 'function') {
  const entries = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
  });
}

// jsdom has no modal <dialog> behavior: model the part the app relies on (the `open` attribute and the close event).
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

// Async queries (`findBy*`, `waitFor`) wait up to 10 s: the machine is shared and jsdom is slow on big tables.
configure({ asyncUtilTimeout: 10_000 });

afterEach(cleanup);
