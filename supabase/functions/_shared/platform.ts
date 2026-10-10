export type RpcResult = { data: unknown; error: { code?: string } | null };
export interface PlatformDependencies {
  rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>;
  verifiedUser(): Promise<string | null>;
  /** True only when Auth is known to require real email confirmation (no autoconfirm). Fails closed. */
  emailConfirmationRequired(): Promise<boolean>;
  invite(email: string, redirect: string): Promise<boolean>;
  magicLink(email: string, redirect: string): Promise<boolean>;
  signSupport(claims: Record<string, unknown>): Promise<string>;
  validateSigningConfiguration(): void;
  appUrl: string;
  now(): number;
}
const permissions = [
  'registry',
  'access_config',
  'access_audit',
  'communication',
  'complaints',
  'amenities',
  'finance',
  'guards',
  'tenant_settings',
  'admin_management',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invitationSecret = /^[a-f0-9]{64}$/;
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
export async function sendInvitation(
  request: Request,
  deps: PlatformDependencies,
): Promise<Response> {
  if (request.method !== 'POST')
    return jsonResponse({ code: 'method_not_allowed' }, 405);
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ code: 'invalid_input' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return jsonResponse({ code: 'invalid_input' }, 400);
  if (
    !uuid.test(String(input.target_tenant_id)) ||
    !uuid.test(String(input.client_event_id)) ||
    typeof input.invited_email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.invited_email) ||
    !['tenant_admin', 'guard', 'unit_holder', 'household_member'].includes(
      String(input.target_role),
    )
  ) {
    return jsonResponse({ code: 'invalid_input' }, 400);
  }
  const actor = await deps.verifiedUser();
  if (!actor) return jsonResponse({ code: 'unauthorized' }, 401);
  // Acceptance trusts that the invitee proved the mailbox; never issue invitations while Auth autoconfirms.
  if (!(await deps.emailConfirmationRequired()))
    return jsonResponse({ code: 'service_unavailable' }, 503);
  const platform = await deps.rpc('current_user_is_platform_admin', {});
  // Every platform-created first admin receives the full documented permission set.
  const adminPermissions =
    input.target_role === 'tenant_admin' && platform.data === true
      ? permissions
      : (input.admin_permissions ?? []);
  // The database generates the secret and its expiry; it returns the secret once, and never again after delivery.
  const result = await deps.rpc('create_invitation', {
    target_tenant_id: input.target_tenant_id,
    invited_email: input.invited_email.toLowerCase(),
    target_role: input.target_role,
    client_event_id: input.client_event_id,
    target_person_id: input.target_person_id ?? null,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    admin_permissions: adminPermissions,
  });
  if (result.error)
    return jsonResponse(
      { code: result.error.code === '42501' ? 'forbidden' : 'invalid_input' },
      result.error.code === '42501' ? 403 : 400,
    );
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as
    { invitation_id?: unknown; invitation_token?: unknown } | undefined;
  const invitationId = String(row?.invitation_id ?? '');
  if (!uuid.test(invitationId))
    return jsonResponse({ code: 'service_unavailable' }, 503);
  // Retry of an invitation that was already delivered: idempotent, no second email.
  if (row?.invitation_token === null)
    return jsonResponse({ invitation_id: invitationId });
  const token = String(row?.invitation_token ?? '');
  if (!invitationSecret.test(token))
    return jsonResponse({ code: 'service_unavailable' }, 503);
  const redirect = new URL('/invitations/accept', deps.appUrl);
  redirect.searchParams.set('token', token);
  const email = input.invited_email.toLowerCase();
  if (
    !(await deps.invite(email, redirect.href)) &&
    !(await deps.magicLink(email, redirect.href))
  ) {
    return jsonResponse(
      { code: 'delivery_failed', invitation_id: invitationId },
      502,
    );
  }
  // Best effort: if this fails, a retry issues a fresh secret and mails again, which only invalidates this email.
  await deps.rpc('mark_invitation_delivered', {
    target_invitation_id: invitationId,
  });
  return jsonResponse({ invitation_id: invitationId });
}

export async function supportSession(
  request: Request,
  deps: PlatformDependencies,
): Promise<Response> {
  if (request.method !== 'POST')
    return jsonResponse({ code: 'method_not_allowed' }, 405);
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ code: 'invalid_input' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return jsonResponse({ code: 'invalid_input' }, 400);
  if (input.action === 'end') {
    if (!uuid.test(String(input.target_support_session_id)))
      return jsonResponse({ code: 'invalid_input' }, 400);
    const result = await deps.rpc('end_support_session', {
      target_support_session_id: input.target_support_session_id,
    });
    return result.error
      ? jsonResponse({ code: 'forbidden' }, 403)
      : jsonResponse({ ended: true });
  }
  if (
    input.action !== 'start' ||
    !uuid.test(String(input.target_tenant_id)) ||
    !uuid.test(String(input.target_user_id)) ||
    !uuid.test(String(input.client_event_id)) ||
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 1 ||
    input.reason.length > 500 ||
    !Number.isInteger(input.duration_minutes ?? 30) ||
    Number(input.duration_minutes ?? 30) < 1 ||
    Number(input.duration_minutes ?? 30) > 60
  )
    return jsonResponse({ code: 'invalid_input' }, 400);
  deps.validateSigningConfiguration();
  const result = await deps.rpc('start_support_session', {
    target_tenant_id: input.target_tenant_id,
    target_user_id: input.target_user_id,
    reason: input.reason,
    client_event_id: input.client_event_id,
    duration_minutes: input.duration_minutes ?? 30,
  });
  if (result.error)
    return jsonResponse(
      {
        code:
          result.error.code === '55000'
            ? 'session_already_active'
            : 'forbidden',
      },
      403,
    );
  const session = result.data as Record<string, unknown>;
  const expires = Math.floor(
    new Date(String(session.support_session_expires_at)).getTime() / 1000,
  );
  const claims = {
    sub: session.support_session_target_user_id,
    role: 'authenticated',
    aud: 'authenticated',
    aal: 'aal1',
    session_id: session.support_session_id,
    support_session_id: session.support_session_id,
    support_tenant_id: session.tenant_id,
    impersonator_user_id: session.support_session_actor_user_id,
    impersonator_aal: 'aal2',
    iat: Math.floor(deps.now() / 1000),
    exp: expires,
  };
  const accessToken = await deps.signSupport(claims);
  return jsonResponse({
    access_token: accessToken,
    expires_at: session.support_session_expires_at,
    support_session_id: session.support_session_id,
    tenant_id: session.tenant_id,
    target_user_id: session.support_session_target_user_id,
  });
}

export function validateLocalSigningFallback(
  environment: string | undefined,
  url: string,
): boolean {
  return (
    environment === 'local' &&
    [
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://kong:8000',
    ].includes(url)
  );
}

export function validateSupportSigningJwk(
  jwk: Record<string, unknown>,
  callerAuthKeyId?: string,
): void {
  if (
    !['ES256', 'RS256'].includes(String(jwk.alg)) ||
    typeof jwk.kid !== 'string' ||
    !jwk.kid ||
    typeof jwk.d !== 'string' ||
    !jwk.d ||
    jwk.kid === callerAuthKeyId ||
    (jwk.alg === 'ES256' && (jwk.kty !== 'EC' || jwk.crv !== 'P-256')) ||
    (jwk.alg === 'RS256' && jwk.kty !== 'RSA')
  )
    throw new Error('support_signing_unavailable');
}
