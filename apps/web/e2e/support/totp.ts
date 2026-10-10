import * as OTPAuth from 'otpauth';

/**
 * The six-digit code an authenticator app would show for `secret` (the base32 key the enrollment page displays).
 * `stepsAhead` picks a later 30 s window, so two codes in a row are never the same one: a TOTP code can only be
 * used once, and the tests enroll and sign in within the same window.
 */
export function totpCode(secret: string, stepsAhead = 0): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate({ timestamp: Date.now() + stepsAhead * 30_000 });
}

/** A code that is well-formed but wrong for any window around now. */
export function wrongCode(secret: string): string {
  const right = new Set(
    [-2, -1, 0, 1, 2].map((offset) => totpCode(secret, offset)),
  );
  for (let candidate = 100_000; candidate < 999_999; candidate += 7919) {
    const text = String(candidate);
    if (!right.has(text)) return text;
  }
  throw new Error('unreachable');
}
