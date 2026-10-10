import { describe, expect, it } from 'vitest';
import messages from '../../messages/es-AR.json';

function leaves(
  value: unknown,
  path: string[] = [],
): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path: path.join('.'), text: value }];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, [...path, key]),
    );
  }
  return [];
}

describe('es-AR messages', () => {
  const all = leaves(messages);

  it('has no empty strings', () => {
    expect(all.filter((entry) => entry.text.trim() === '')).toEqual([]);
  });

  it('keeps ICU placeholders balanced', () => {
    for (const entry of all) {
      expect(entry.text.split('{').length, entry.path).toBe(
        entry.text.split('}').length,
      );
    }
  });

  it('has a navigation label and a tab label for every item', () => {
    expect(Object.keys(messages.nav.tabs).sort()).toEqual(
      Object.keys(messages.nav.items).sort(),
    );
  });

  it('covers every membership role', () => {
    expect(Object.keys(messages.roles).sort()).toEqual(
      [
        'guard',
        'household_member',
        'platform_admin',
        'tenant_admin',
        'unit_holder',
      ].sort(),
    );
  });
});
