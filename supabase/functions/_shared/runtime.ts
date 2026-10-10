import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { importJWK, SignJWT } from 'npm:jose@6.2.2';
import { reportMessage } from './reporting.js';
import {
  jsonResponse,
  type PlatformDependencies,
  validateLocalSigningFallback,
  validateSupportSigningJwk,
} from './platform.ts';

export function servePlatform(
  handler: (request: Request, deps: PlatformDependencies) => Promise<Response>,
) {
  Deno.serve(async (request) => {
    const origin = request.headers.get('Origin');
    const appOrigin = new URL(
      Deno.env.get('DOMUS_APP_URL') ?? 'http://127.0.0.1:3000',
    ).origin;
    if (origin && origin !== appOrigin)
      return jsonResponse({ code: 'origin_denied' }, 403);
    let response: Response;
    if (request.method === 'OPTIONS')
      response = new Response(null, { status: 204 });
    else {
      try {
        response = await handler(request, dependencies(request));
      } catch {
        response = jsonResponse({ code: 'service_unavailable' }, 503);
      }
    }
    if (response.status >= 500)
      reportMessage('error', 'platform_function_failed', {
        operation: handler.name,
      });
    response.headers.set('Access-Control-Allow-Origin', appOrigin);
    response.headers.set(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info',
    );
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Vary', 'Origin');
    return response;
  });
}

export function dependencies(request: Request): PlatformDependencies {
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: {
      headers: { Authorization: request.headers.get('Authorization') ?? '' },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(
    url,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const jwkText = Deno.env.get('DOMUS_SUPPORT_SIGNING_JWK');
  const localSecret = Deno.env.get('DOMUS_LOCAL_JWT_SECRET');
  const local = validateLocalSigningFallback(
    Deno.env.get('DOMUS_ENVIRONMENT'),
    url,
  );
  const validateSigningConfiguration = () => {
    if (jwkText) {
      const jwk = JSON.parse(jwkText);
      let callerKeyId: string | undefined;
      try {
        const header = request.headers
          .get('Authorization')
          ?.split(' ')[1]
          .split('.')[0];
        if (header)
          callerKeyId = JSON.parse(
            atob(header.replaceAll('-', '+').replaceAll('_', '/')),
          ).kid;
      } catch {
        /* The caller RPC independently verifies the complete token. */
      }
      validateSupportSigningJwk(jwk, callerKeyId);
    } else if (!local || !localSecret)
      throw new Error('support_signing_unavailable');
  };
  return {
    rpc: async (name, args) => await caller.rpc(name, args),
    verifiedUser: async () => {
      const { data, error } = await caller.auth.getUser();
      return !error && data.user?.email_confirmed_at ? data.user.id : null;
    },
    invitationToken: async (event, actor) => {
      const secret = Deno.env.get('DOMUS_INVITATION_TOKEN_KEY');
      if (!secret || secret.length < 32)
        throw new Error('invitation_signing_unavailable');
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const bytes = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(`${actor}:${event}`),
      );
      return Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
    },
    invite: async (email, redirectTo) => {
      const { error } = await service.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      return !error;
    },
    magicLink: async (email, emailRedirectTo) => {
      const { error } = await caller.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo },
      });
      return !error;
    },
    validateSigningConfiguration,
    signSupport: async (claims) => {
      validateSigningConfiguration();
      if (jwkText) {
        const jwk = JSON.parse(jwkText);
        return await new SignJWT(claims)
          .setProtectedHeader({ alg: jwk.alg, kid: jwk.kid, typ: 'JWT' })
          .setIssuer(`${url}/auth/v1`)
          .sign(await importJWK(jwk, jwk.alg));
      }
      return await new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer(`${url}/auth/v1`)
        .sign(new TextEncoder().encode(localSecret!));
    },
    appUrl: Deno.env.get('DOMUS_APP_URL') ?? 'http://127.0.0.1:3000',
    now: () => Date.now(),
  };
}
