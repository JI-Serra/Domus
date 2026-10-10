// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData } from '@/test/server-mocks';

const getRequestContext = vi.fn();
const submitJoinRequest = vi.fn();
const cancelJoinRequest = vi.fn();
const revalidatePath = vi.fn();
const reportError = vi.fn();
const client = { id: 'client' };

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('@domus/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve(client),
}));
vi.mock('@/lib/household/join-rpc', () => ({
  submitJoinRequest: (...args: unknown[]) => submitJoinRequest(...args),
  cancelJoinRequest: (...args: unknown[]) => cancelJoinRequest(...args),
}));

const { submitJoinRequestAction, cancelJoinRequestAction } =
  await import('./actions');

const IDLE = { status: 'idle' } as const;
const EVENT = '80000000-0000-4000-8000-000000000001';
const REQUEST = '90000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  getRequestContext.mockResolvedValue({ identity: { userId: 'u' } });
  submitJoinRequest.mockResolvedValue({ status: 'pending' });
  cancelJoinRequest.mockResolvedValue({ error: null });
});

const joinForm = (overrides: Record<string, string> = {}) =>
  formData({
    join_code: 'abcd efgh jkmn',
    person_first_name: ' Ana ',
    person_last_name: 'Gómez',
    person_document_type: '',
    person_document_number: '',
    client_event_id: EVENT,
    ...overrides,
  });

describe('submitJoinRequestAction (D22)', () => {
  it('sends the normalized code and the minimum data, without naming a barrio', async () => {
    expect(await submitJoinRequestAction(IDLE, joinForm())).toEqual({
      status: 'success',
      notice: 'sent',
    });
    expect(submitJoinRequest).toHaveBeenCalledWith(client, {
      join_code: 'ABCDEFGHJKMN',
      person_data: { person_first_name: 'Ana', person_last_name: 'Gómez' },
      client_event_id: EVENT,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/join');
  });

  it('sends the document only when both parts are there', async () => {
    await submitJoinRequestAction(
      IDLE,
      joinForm({
        person_document_type: 'dni',
        person_document_number: '12345678',
      }),
    );
    expect(submitJoinRequest.mock.calls[0]?.[1].person_data).toMatchObject({
      person_document_type: 'dni',
      person_document_number: '12345678',
    });
    expect(
      await submitJoinRequestAction(
        IDLE,
        joinForm({ person_document_type: 'dni' }),
      ),
    ).toMatchObject({
      errors: { person_document_number: 'documentIncomplete' },
    });
  });

  it('answers the same for a malformed code and for one the server does not accept', async () => {
    const malformed = await submitJoinRequestAction(
      IDLE,
      joinForm({ join_code: 'ABC' }),
    );
    submitJoinRequest.mockResolvedValue({ status: 'unavailable' });
    const unknown = await submitJoinRequestAction(IDLE, joinForm());
    expect(malformed).toMatchObject({
      status: 'error',
      errors: { join_code: 'codeUnavailable' },
    });
    expect(unknown).toMatchObject({
      status: 'error',
      errors: { join_code: 'codeUnavailable' },
    });
    // Nothing is sent to the server for a malformed code.
    expect(submitJoinRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps what the person typed when it fails', async () => {
    submitJoinRequest.mockResolvedValue({ status: 'unavailable' });
    expect(await submitJoinRequestAction(IDLE, joinForm())).toMatchObject({
      values: { person_first_name: ' Ana ', person_last_name: 'Gómez' },
    });
  });

  it('asks for the name', async () => {
    expect(
      await submitJoinRequestAction(
        IDLE,
        joinForm({ person_first_name: '', person_last_name: '' }),
      ),
    ).toMatchObject({
      errors: {
        person_first_name: 'firstNameRequired',
        person_last_name: 'lastNameRequired',
      },
    });
  });

  it('refuses a visitor without session and a missing event key', async () => {
    getRequestContext.mockResolvedValue(null);
    expect(await submitJoinRequestAction(IDLE, joinForm())).toMatchObject({
      formError: 'unknown',
    });
    getRequestContext.mockResolvedValue({});
    expect(
      await submitJoinRequestAction(IDLE, joinForm({ client_event_id: 'x' })),
    ).toMatchObject({ formError: 'unknown' });
    expect(submitJoinRequest).not.toHaveBeenCalled();
  });

  it('reports a server failure by its code only', async () => {
    submitJoinRequest.mockResolvedValue({ error: 'XX000' });
    expect(await submitJoinRequestAction(IDLE, joinForm())).toMatchObject({
      formError: 'unknown',
    });
    expect(String(reportError.mock.calls[0]?.[0])).toContain('XX000');
    expect(String(reportError.mock.calls[0]?.[0])).not.toContain('ABCDEFGH');
  });
});

describe('cancelJoinRequestAction', () => {
  it('cancels the caller own request with a fresh event key', async () => {
    expect(await cancelJoinRequestAction(REQUEST)).toEqual({
      status: 'success',
      notice: 'cancelled',
    });
    const [, id, eventId] = cancelJoinRequest.mock.calls[0] ?? [];
    expect(id).toBe(REQUEST);
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives one answer when the database refuses (not yours, not pending, unknown)', async () => {
    cancelJoinRequest.mockResolvedValue({ error: '42501' });
    expect(await cancelJoinRequestAction(REQUEST)).toMatchObject({
      status: 'error',
      formError: 'cancelFailed',
    });
    expect(reportError).not.toHaveBeenCalled();
    expect(await cancelJoinRequestAction('nope')).toMatchObject({
      formError: 'cancelFailed',
    });
  });
});
