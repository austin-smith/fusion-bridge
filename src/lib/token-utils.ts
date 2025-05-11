/**
 * Calculates the absolute expiration timestamp in milliseconds.
 * @param expiresInSeconds The duration for which the token is valid, in seconds. Can be a number or a string.
 * @param startTimeMs The reference start time in milliseconds since epoch. Defaults to Date.now().
 * @returns The expiration timestamp in milliseconds since epoch.
 */
export function calculateExpiresAt(expiresInSeconds: number | string, startTimeMs: number = Date.now()): number {
  const durationSeconds = Number(expiresInSeconds);
  if (isNaN(durationSeconds)) {
    console.warn(`[calculateExpiresAt] Invalid expiresInSeconds value: ${expiresInSeconds}. Returning start time.`);
    return startTimeMs; // Or throw an error, depending on desired strictness
  }
  return startTimeMs + (durationSeconds * 1000);
}

/**
 * Checks if a token is expired or will expire soon.
 * @param expiresAtMs The token's expiration timestamp in milliseconds since epoch.
 * @param bufferSeconds A buffer period in seconds. If the token expires within this buffer, it's considered expiring.
 *                      Defaults to 300 seconds (5 minutes).
 * @returns True if the token is undefined, expired, or expiring within the buffer, false otherwise.
 */
export function isTokenExpiring(expiresAtMs: number | undefined, bufferSeconds: number = 300): boolean {
  if (expiresAtMs === undefined || expiresAtMs === null) {
    return true; // Consider undefined/null as immediately expiring
  }
  const nowMs = Date.now();
  const bufferMs = bufferSeconds * 1000;
  return nowMs >= (expiresAtMs - bufferMs);
} 