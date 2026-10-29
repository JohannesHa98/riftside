/**
 * How many wrong guesses an address gets before it is shut out.
 *
 * Pure: no database, no Next.js. The counting happens in Postgres, which is
 * the only store every serverless instance shares — an in-memory counter
 * would reset on a cold start and disagree between instances, which is to say
 * it would not be a limit at all.
 */

import { createHash } from "node:crypto";

/** Wrong guesses allowed inside the window before the door shuts. */
export const MAX_ATTEMPTS = 8;
/** How far back failures are counted, and how long a lockout then lasts. */
export const ATTEMPT_WINDOW_MINUTES = 15;

export function windowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ATTEMPT_WINDOW_MINUTES * 60 * 1000);
}

export function isLockedOut(failures: number): boolean {
  return failures >= MAX_ATTEMPTS;
}

/**
 * Which address a request came from, as Vercel reports it.
 *
 * `x-forwarded-for` is a chain — the client first, then each proxy — so the
 * first entry is the one to count. It can be spoofed by anyone talking to the
 * origin directly, which is exactly why this throttle is a speed bump on top
 * of a strong password rather than the thing keeping anyone out.
 */
export function clientAddress(forwardedFor: string | null): string {
  const first = (forwardedFor ?? "").split(",")[0]?.trim() ?? "";
  return first.length === 0 ? "unknown" : first;
}

/**
 * Addresses are stored hashed, salted with AUTH_SECRET. The throttle needs to
 * recognise a repeat visitor, not to know who they are, and an IP address is
 * personal data — so there is no reason to keep one.
 */
export function addressKey(address: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${address}`).digest("hex");
}
