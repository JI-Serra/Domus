// HR-00 demo: a forced error is recorded with tenant context and no PII.
export const dynamic = 'force-dynamic';

function debugRoutesEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.DOMUS_ENABLE_DEBUG_ROUTES === 'true'
  );
}

class ForcedDebugError extends Error {
  // Read by `onRequestError` in instrumentation.ts.
  readonly domusReportingContext: {
    tenantId?: string;
    membershipRole?: string;
  };

  constructor(
    message: string,
    reportingContext: { tenantId?: string; membershipRole?: string },
  ) {
    super(message);
    this.name = 'ForcedDebugError';
    this.domusReportingContext = reportingContext;
  }
}

export function GET(request: Request): Response {
  if (!debugRoutesEnabled()) {
    return new Response('Not Found', { status: 404 });
  }
  // The fake PII in the message exists to prove the scrubber removes it before reporting.
  throw new ForcedDebugError(
    'Forced debug error for resident juan.perez@example.com, DNI 30123456, phone +54 9 11 5555-1234',
    {
      tenantId: request.headers.get('x-domus-tenant-id') ?? 'demo-tenant-a',
      membershipRole:
        request.headers.get('x-domus-membership-role') ?? 'tenant_admin',
    },
  );
}
