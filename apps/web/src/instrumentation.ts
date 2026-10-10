import type { Instrumentation } from 'next';
import { reportError, setReportingContext } from '@domus/observability';
import {
  MEMBERSHIP_ROLE_HEADER,
  TENANT_ID_HEADER,
} from '@/lib/context/headers';

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function register(): void {
  setReportingContext({
    environment: process.env.DOMUS_ENVIRONMENT ?? 'local',
    release: process.env.DOMUS_RELEASE,
  });
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  // An error may carry the tenant context it was raised in (see the debug route).
  const carried = (error as { domusReportingContext?: Record<string, unknown> })
    .domusReportingContext;
  reportError(error, {
    tenantId: firstHeader(request.headers[TENANT_ID_HEADER]),
    membershipRole: firstHeader(request.headers[MEMBERSHIP_ROLE_HEADER]),
    ...carried,
    method: request.method,
    path: request.path.split('?')[0],
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
  });
};
