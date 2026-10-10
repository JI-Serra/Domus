// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData, navigatesTo, redirect } from '@/test/server-mocks';

const getPlatformClient = vi.fn();
const createTenant = vi.fn();
const sendInvitation = vi.fn();
const revokeInvitation = vi.fn();
const revalidatePath = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/platform/guard', () => ({
  getPlatformClient: () => getPlatformClient(),
}));
vi.mock('@domus/supabase/platform', () => ({
  createTenant: (...args: unknown[]) => createTenant(...args),
  sendInvitation: (...args: unknown[]) => sendInvitation(...args),
  revokeInvitation: (...args: unknown[]) => revokeInvitation(...args),
}));

const {
  changeSubscriptionAction,
  createTenantAction,
  inviteAdminAction,
  revokeInvitationAction,
  saveBillableCriteriaAction,
  updateTenantAction,
} = await import('./actions');

const IDLE = { status: 'idle' } as const;
const TENANT = '10000000-0000-4000-8000-000000000001';
const EVENT = '80000000-0000-4000-8000-000000000001';

/** Chainable table double: `update(...).eq(...).select(...)` resolves to `result`. */
function tableDouble(result: {
  data: unknown;
  error: { code: string } | null;
}) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const name of ['select', 'update', 'eq', 'maybeSingle'])
    chain[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  return { chain, calls };
}

let client: {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  storage: { from: ReturnType<typeof vi.fn> };
};
const upload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ error: null });
  client = {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload })) },
  };
  getPlatformClient.mockResolvedValue(client);
  createTenant.mockResolvedValue({ data: TENANT, error: null });
});

const tenantForm = (overrides: Record<string, string> = {}) =>
  formData({
    tenant_name: 'Los Ceibos',
    tenant_slug: 'los-ceibos',
    tenant_address: 'Calle 1',
    tenant_time_zone: 'America/Argentina/Tucuman',
    tenant_subscription_status: 'pilot',
    client_event_id: EVENT,
    ...overrides,
  });

describe('createTenantAction', () => {
  it('refuses anybody who is not an MFA platform admin', async () => {
    getPlatformClient.mockResolvedValue(null);
    const state = await createTenantAction(IDLE, tenantForm());
    expect(state).toMatchObject({ status: 'error', formError: 'denied' });
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('reports each invalid field by key and keeps what was typed', async () => {
    const state = await createTenantAction(
      IDLE,
      tenantForm({ tenant_name: ' ', tenant_slug: 'Mal Slug' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      errors: { tenant_name: 'nameRequired', tenant_slug: 'slugInvalid' },
      values: { tenant_slug: 'Mal Slug' },
    });
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('rejects a logo of the wrong type or size before anything is created', async () => {
    const data = tenantForm();
    data.set('logo', new File(['x'], 'logo.gif', { type: 'image/gif' }));
    expect(await createTenantAction(IDLE, data)).toMatchObject({
      errors: { logo: 'logoType' },
    });
    expect(createTenant).not.toHaveBeenCalled();
  });

  it('needs an idempotency key', async () => {
    const state = await createTenantAction(
      IDLE,
      tenantForm({ client_event_id: 'nope' }),
    );
    expect(state).toMatchObject({ formError: 'unknown' });
  });

  it('creates the barrio with the form event id and lands on its page', async () => {
    await expect(
      navigatesTo(() => createTenantAction(IDLE, tenantForm())),
    ).resolves.toBe(`/platform/tenants/${TENANT}`);
    expect(createTenant).toHaveBeenCalledWith(client, {
      tenant_name: 'Los Ceibos',
      tenant_slug: 'los-ceibos',
      tenant_address: 'Calle 1',
      tenant_time_zone: 'America/Argentina/Tucuman',
      tenant_subscription_status: 'pilot',
      client_event_id: EVENT,
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads the logo into the tenant folder and records its path', async () => {
    const { chain, calls } = tableDouble({ data: null, error: null });
    client.from.mockReturnValue(chain);
    const data = tenantForm();
    data.set('logo', new File(['x'], 'x.png', { type: 'image/png' }));
    await expect(
      navigatesTo(() => createTenantAction(IDLE, data)),
    ).resolves.toBe(`/platform/tenants/${TENANT}`);
    expect(upload).toHaveBeenCalledWith(
      `${TENANT}/logo.png`,
      expect.any(File),
      {
        contentType: 'image/png',
        upsert: true,
      },
    );
    expect(calls).toContainEqual([
      'update',
      [{ tenant_logo_path: `${TENANT}/logo.png` }],
    ]);
  });

  it('still opens the barrio when only the logo failed, and says so', async () => {
    upload.mockResolvedValue({ error: { message: 'nope' } });
    const data = tenantForm();
    data.set('logo', new File(['x'], 'x.png', { type: 'image/png' }));
    await expect(
      navigatesTo(() => createTenantAction(IDLE, data)),
    ).resolves.toBe(`/platform/tenants/${TENANT}?notice=logoFailed`);
  });

  it.each([
    ['23505', { errors: { tenant_slug: 'slugTaken' } }],
    ['42501', { formError: 'denied' }],
    ['22023', { formError: 'invalid' }],
    ['XX000', { formError: 'unknown' }],
  ])('maps database error %s', async (code, expected) => {
    createTenant.mockResolvedValue({ data: null, error: { code } });
    expect(await createTenantAction(IDLE, tenantForm())).toMatchObject(
      expected,
    );
  });
});

describe('updateTenantAction', () => {
  it('updates name, address and time zone, never the slug or the status', async () => {
    const { chain, calls } = tableDouble({
      data: [{ tenant_id: TENANT }],
      error: null,
    });
    client.from.mockReturnValue(chain);
    const state = await updateTenantAction(
      TENANT,
      IDLE,
      tenantForm({
        tenant_slug: 'otro',
        tenant_subscription_status: 'cancelled',
      }),
    );
    expect(state).toEqual({ status: 'success', notice: 'saved' });
    expect(calls[0]).toEqual([
      'update',
      [
        {
          tenant_name: 'Los Ceibos',
          tenant_address: 'Calle 1',
          tenant_time_zone: 'America/Argentina/Tucuman',
        },
      ],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/platform/tenants/${TENANT}`);
  });

  it('treats an update that touched no row as denied', async () => {
    client.from.mockReturnValue(tableDouble({ data: [], error: null }).chain);
    expect(await updateTenantAction(TENANT, IDLE, tenantForm())).toMatchObject({
      formError: 'denied',
    });
  });

  it('reports a logo that could not be stored, after saving the data', async () => {
    client.from.mockReturnValue(
      tableDouble({ data: [{ tenant_id: TENANT }], error: null }).chain,
    );
    upload.mockResolvedValue({ error: { message: 'nope' } });
    const data = tenantForm();
    data.set('logo', new File(['x'], 'x.webp', { type: 'image/webp' }));
    expect(await updateTenantAction(TENANT, IDLE, data)).toMatchObject({
      errors: { logo: 'logoUploadFailed' },
    });
  });

  it('refuses an invalid id and invalid fields', async () => {
    expect(await updateTenantAction('nope', IDLE, tenantForm())).toMatchObject({
      formError: 'denied',
    });
    expect(
      await updateTenantAction(TENANT, IDLE, tenantForm({ tenant_name: '' })),
    ).toMatchObject({ errors: { tenant_name: 'nameRequired' } });
  });

  it('maps database failures', async () => {
    client.from.mockReturnValue(
      tableDouble({ data: null, error: { code: '42501' } }).chain,
    );
    expect(await updateTenantAction(TENANT, IDLE, tenantForm())).toMatchObject({
      formError: 'denied',
    });
    client.from.mockReturnValue(
      tableDouble({ data: null, error: { code: 'XX000' } }).chain,
    );
    expect(await updateTenantAction(TENANT, IDLE, tenantForm())).toMatchObject({
      formError: 'unknown',
    });
  });
});

describe('changeSubscriptionAction', () => {
  it('changes only the status, keeping the slug', async () => {
    client.from.mockReturnValue(
      tableDouble({ data: { tenant_slug: 'los-ceibos' }, error: null }).chain,
    );
    client.rpc.mockResolvedValue({ error: null });
    expect(await changeSubscriptionAction(TENANT, 'suspended')).toEqual({
      status: 'success',
      notice: 'statusChanged',
    });
    expect(client.rpc).toHaveBeenCalledWith('update_tenant_platform_settings', {
      target_tenant_id: TENANT,
      new_slug: 'los-ceibos',
      new_subscription_status: 'suspended',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/platform/tenants');
  });

  it('refuses unknown statuses, bad ids and non-admins', async () => {
    expect(await changeSubscriptionAction(TENANT, 'deleted')).toMatchObject({
      formError: 'denied',
    });
    expect(await changeSubscriptionAction('x', 'active')).toMatchObject({
      formError: 'denied',
    });
    getPlatformClient.mockResolvedValue(null);
    expect(await changeSubscriptionAction(TENANT, 'active')).toMatchObject({
      formError: 'denied',
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('is denied when the barrio cannot be read, and maps RPC errors', async () => {
    client.from.mockReturnValue(tableDouble({ data: null, error: null }).chain);
    expect(await changeSubscriptionAction(TENANT, 'active')).toMatchObject({
      formError: 'denied',
    });
    client.from.mockReturnValue(
      tableDouble({ data: { tenant_slug: 's' }, error: null }).chain,
    );
    client.rpc.mockResolvedValue({ error: { code: '42501' } });
    expect(await changeSubscriptionAction(TENANT, 'active')).toMatchObject({
      formError: 'denied',
    });
    client.rpc.mockResolvedValue({ error: { code: 'XX000' } });
    expect(await changeSubscriptionAction(TENANT, 'active')).toMatchObject({
      formError: 'unknown',
    });
  });
});

describe('saveBillableCriteriaAction', () => {
  const statuses = (...values: string[]) => {
    const data = new FormData();
    for (const value of values) data.append('unit_status', value);
    return data;
  };

  it('stores the chosen statuses', async () => {
    const { chain, calls } = tableDouble({
      data: [{ tenant_id: TENANT }],
      error: null,
    });
    client.from.mockReturnValue(chain);
    expect(
      await saveBillableCriteriaAction(
        TENANT,
        IDLE,
        statuses('occupied', 'vacant'),
      ),
    ).toEqual({ status: 'success', notice: 'saved' });
    expect(calls[0]).toEqual([
      'update',
      [{ tenant_billable_unit_statuses: ['occupied', 'vacant'] }],
    ]);
  });

  it('needs at least one valid status', async () => {
    expect(
      await saveBillableCriteriaAction(TENANT, IDLE, statuses()),
    ).toMatchObject({ formError: 'billableRequired' });
    expect(
      await saveBillableCriteriaAction(TENANT, IDLE, statuses('other')),
    ).toMatchObject({ formError: 'billableRequired' });
    expect(
      await saveBillableCriteriaAction(
        TENANT,
        IDLE,
        statuses('vacant', 'vacant'),
      ),
    ).toMatchObject({ formError: 'billableRequired' });
  });

  it('maps denials', async () => {
    client.from.mockReturnValue(tableDouble({ data: [], error: null }).chain);
    expect(
      await saveBillableCriteriaAction(TENANT, IDLE, statuses('vacant')),
    ).toMatchObject({ formError: 'denied' });
    getPlatformClient.mockResolvedValue(null);
    expect(
      await saveBillableCriteriaAction(TENANT, IDLE, statuses('vacant')),
    ).toMatchObject({ formError: 'denied' });
  });
});

describe('inviteAdminAction', () => {
  const invitation = (overrides: Record<string, string> = {}) =>
    formData({
      invited_email: ' ANA@Ejemplo.com ',
      first_name: 'Ana',
      last_name: 'Pérez',
      client_event_id: EVENT,
      ...overrides,
    });
  const failure = (code: string) => ({
    context: new Response(JSON.stringify({ code }), { status: 400 }),
  });

  it('asks the function to invite a tenant admin, with a normalized email and the retry key', async () => {
    sendInvitation.mockResolvedValue({
      data: { invitation_id: 'i' },
      error: null,
    });
    expect(await inviteAdminAction(TENANT, IDLE, invitation())).toEqual({
      status: 'success',
      notice: 'invited',
    });
    expect(sendInvitation).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      invited_email: 'ana@ejemplo.com',
      target_role: 'tenant_admin',
      first_name: 'Ana',
      last_name: 'Pérez',
      client_event_id: EVENT,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/platform/tenants/${TENANT}`);
  });

  it('validates the person before calling the function', async () => {
    const state = await inviteAdminAction(
      TENANT,
      IDLE,
      invitation({ invited_email: 'mal', first_name: '' }),
    );
    expect(state).toMatchObject({
      errors: {
        invited_email: 'emailInvalid',
        first_name: 'firstNameRequired',
      },
    });
    expect(sendInvitation).not.toHaveBeenCalled();
    expect(
      await inviteAdminAction(
        TENANT,
        IDLE,
        invitation({ client_event_id: 'x' }),
      ),
    ).toMatchObject({ formError: 'unknown' });
  });

  it.each([
    ['delivery_failed', 'deliveryFailed'],
    ['forbidden', 'denied'],
    ['unauthorized', 'denied'],
    ['invalid_input', 'invalid'],
    ['service_unavailable', 'unknown'],
  ])('maps function code %s to %s', async (code, key) => {
    sendInvitation.mockResolvedValue({ data: null, error: failure(code) });
    expect(await inviteAdminAction(TENANT, IDLE, invitation())).toMatchObject({
      formError: key,
      values: { first_name: 'Ana' },
    });
  });

  it('refuses a non-admin', async () => {
    getPlatformClient.mockResolvedValue(null);
    expect(await inviteAdminAction(TENANT, IDLE, invitation())).toMatchObject({
      formError: 'denied',
    });
  });
});

describe('revokeInvitationAction', () => {
  const INVITATION = '90000000-0000-4000-8000-000000000001';

  it('revokes through the RPC', async () => {
    revokeInvitation.mockResolvedValue({ error: null });
    expect(await revokeInvitationAction(TENANT, INVITATION)).toEqual({
      status: 'success',
      notice: 'revoked',
    });
    expect(revokeInvitation).toHaveBeenCalledWith(client, INVITATION);
  });

  it('maps errors and refuses bad input', async () => {
    revokeInvitation.mockResolvedValue({ error: { code: '42501' } });
    expect(await revokeInvitationAction(TENANT, INVITATION)).toMatchObject({
      formError: 'denied',
    });
    revokeInvitation.mockResolvedValue({ error: { code: 'XX000' } });
    expect(await revokeInvitationAction(TENANT, INVITATION)).toMatchObject({
      formError: 'unknown',
    });
    expect(await revokeInvitationAction(TENANT, 'x')).toMatchObject({
      formError: 'denied',
    });
  });
});
