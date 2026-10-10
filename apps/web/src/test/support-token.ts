/** A support-shaped JWT for tests. The signature is a placeholder: the app only reads claims, the database verifies. */
export function supportToken(
  overrides: Record<string, unknown> = {},
  secondsFromNow = 600,
  now: Date = new Date(),
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: 'target-user',
    support_session_id: '00000000-0000-4000-8000-0000000000aa',
    support_tenant_id: 'tenant-1',
    exp: Math.floor(now.getTime() / 1000) + secondsFromNow,
    ...overrides,
  })}.signature`;
}
