import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOCK_CONTEXTS } from '@/test/fixtures';
import { renderWithShell } from '@/test/render';
import { GlobalSearch } from './global-search';
import {
  filterByPermissions,
  firstAllowedChild,
  getNavigation,
  getRegistryNavigation,
} from './navigation';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';

let pathname = '/registry/units';
const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));

const [HOLDER, ADMIN] = MOCK_CONTEXTS.map(
  (context) => context.membership_id,
) as [string, string];

beforeEach(() => {
  pathname = '/registry/units';
  push.mockClear();
});

describe('Padrón navigation by permission', () => {
  const ids = (entries: ReturnType<typeof filterByPermissions>) =>
    entries.flatMap((entry) => [
      entry.id,
      ...(entry.children?.map((c) => c.id) ?? []),
    ]);
  const registryEntry = getNavigation('tenant_admin').find(
    (e) => e.id === 'registry',
  );

  it('offers Unidades, Importar and Guardias with registry, and Puestos with guards', () => {
    const registryOnly = filterByPermissions(
      registryEntry ? [registryEntry] : [],
      ['registry'],
    );
    expect(ids(registryOnly)).toEqual([
      'registry',
      'registryUnits',
      'registryImport',
      'registryGuards',
    ]);
    const guardsOnly = filterByPermissions(
      registryEntry ? [registryEntry] : [],
      ['guards'],
    );
    expect(ids(guardsOnly)).toEqual(['registry', 'registryGates']);
  });

  it('drops the whole section without either permission, and keeps entries that need none', () => {
    const entries = getNavigation('tenant_admin');
    const none = filterByPermissions(entries, ['finance']);
    expect(none.some((entry) => entry.id === 'registry')).toBe(false);
    expect(none.some((entry) => entry.id === 'home')).toBe(true);
  });

  it('leads /registry to the first destination the permissions allow', () => {
    const parent = getRegistryNavigation();
    expect(firstAllowedChild(parent, ['registry', 'guards'])?.href).toBe(
      '/registry/units',
    );
    expect(firstAllowedChild(parent, ['guards'])?.href).toBe('/registry/gates');
    expect(firstAllowedChild(parent, [])).toBeUndefined();
    expect(firstAllowedChild(undefined, ['registry'])).toBeUndefined();
  });

  it('shows the second level in the sidebar, gated by the held permissions', () => {
    renderWithShell(<Sidebar />, ADMIN, { adminPermissions: ['guards'] });
    const nav = screen.getByRole('navigation', {
      name: 'Navegación principal',
    });
    expect(
      within(nav).getByRole('link', { name: 'Padrón' }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: 'Puestos' }),
    ).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Unidades' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Importar' })).toBeNull();
  });

  it('marks the active second-level entry', () => {
    pathname = '/registry/import';
    renderWithShell(<Sidebar />, ADMIN);
    expect(screen.getByRole('link', { name: 'Importar' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Unidades' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('hides Padrón from the tab bar when the administrator has neither permission', () => {
    renderWithShell(<TabBar />, ADMIN, { adminPermissions: [] });
    expect(screen.queryByRole('link', { name: 'Padrón' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('keeps one Padrón tab on small screens (the strip inside the area has the rest)', () => {
    renderWithShell(<TabBar />, ADMIN);
    expect(screen.getAllByRole('link', { name: 'Padrón' })).toHaveLength(1);
    expect(screen.queryByRole('link', { name: 'Unidades' })).toBeNull();
  });
});

describe('GlobalSearch', () => {
  const hits = [
    {
      kind: 'unit',
      id: 'u1',
      unitId: 'u1',
      unitCode: 'Mz 1',
      title: 'Mz 1',
      detail: null,
    },
    {
      kind: 'person',
      id: 'p1',
      unitId: 'u1',
      unitCode: 'Mz 1',
      title: 'Ana Gómez',
      detail: 'ana@x.com',
    },
    {
      kind: 'vehicle',
      id: 'v1',
      unitId: 'u2',
      unitCode: 'Mz 2',
      title: 'AB123CD',
      detail: 'AB123CD',
    },
  ];
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ hits }) });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const type = async (box: HTMLElement, text: string) => {
    fireEvent.change(box, { target: { value: text } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
  };

  it('is only there for administrators with the registry permission', () => {
    const { container } = renderWithShell(<GlobalSearch />, ADMIN, {
      adminPermissions: ['guards'],
    });
    expect(container).toBeEmptyDOMElement();
    const resident = renderWithShell(<GlobalSearch />, HOLDER, {
      adminPermissions: ['registry'],
    });
    expect(resident.container).toBeEmptyDOMElement();
  });

  it('waits for two characters, debounces and finds units, people and plates', async () => {
    renderWithShell(<GlobalSearch />, ADMIN);
    const box = screen.getByRole('combobox', { name: 'Buscar en el padrón' });
    await type(box, 'a');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'an' } });
    fireEvent.change(box, { target: { value: 'ana' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/registry/search?q=ana',
    );
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent('Ana Gómez');
    expect(options[1]).toHaveTextContent('Persona · Unidad Mz 1 · ana@x.com');
    expect(options[2]).toHaveTextContent('Vehículo · Unidad Mz 2');
  });

  it('works with the keyboard: arrows move, Enter opens the unit sheet, Escape closes', async () => {
    renderWithShell(<GlobalSearch />, ADMIN);
    const box = screen.getByRole('combobox', { name: 'Buscar en el padrón' });
    await type(box, 'mz');
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(box.getAttribute('aria-activedescendant')).toBe(
      screen.getAllByRole('option')[2]?.id,
    );
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/registry/units/u2');
    expect(box).toHaveValue('');

    await type(box, 'mz');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a result with a click and focuses the field with Ctrl+K', async () => {
    renderWithShell(<GlobalSearch />, ADMIN);
    const box = screen.getByRole('combobox', { name: 'Buscar en el padrón' });
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(box).toHaveFocus();
    await type(box, 'mz');
    fireEvent.click(screen.getAllByRole('option')[1] as HTMLElement);
    expect(push).toHaveBeenCalledWith('/registry/units/u1');
  });

  it('says when nothing matches and when the search failed', async () => {
    renderWithShell(<GlobalSearch />, ADMIN);
    const box = screen.getByRole('combobox', { name: 'Buscar en el padrón' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ hits: [] }) });
    await type(box, 'zzz');
    expect(
      within(screen.getByRole('listbox')).getByText('Sin resultados'),
    ).toBeInTheDocument();
    fetchMock.mockResolvedValue({ ok: false });
    await type(box, 'zzzz');
    expect(
      screen.getByText('No pudimos buscar. Volvé a intentar.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('ignores the answer of a search that was superseded', async () => {
    let finishFirst: (value: unknown) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((resolve, reject) => {
          finishFirst = resolve;
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    renderWithShell(<GlobalSearch />, ADMIN);
    const box = screen.getByRole('combobox', { name: 'Buscar en el padrón' });
    await type(box, 'ab');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ hits: [hits[1]] }),
    });
    await type(box, 'abc');
    finishFirst({ ok: true, json: async () => ({ hits }) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});
