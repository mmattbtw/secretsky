const RENEWAL_LEAD_MS = 60 * 60 * 1000;

export const REGISTRATION_RETRY_MS = 5 * 60 * 1000;

export function registrationRenewalDelay(
  expiresAt: string,
  now = Date.now(),
): number {
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) return 0;
  return Math.max(0, expires - now - RENEWAL_LEAD_MS);
}
