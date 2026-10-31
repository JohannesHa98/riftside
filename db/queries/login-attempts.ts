/** Failed sign-ins, counted so an address can be shut out after too many. */

import { and, count, eq, gte, lt } from "drizzle-orm";

import { windowStart } from "@/lib/login-throttle";

import { db } from "../index";
import { loginAttempts } from "../schema";

/**
 * How many times this address has guessed wrong inside the window.
 *
 * Old rows are dropped on the way past rather than by a scheduled job: the
 * table only ever holds the last few minutes of failures, so there is nothing
 * to tidy up later.
 */
export async function countRecentLoginFailures(addressKey: string): Promise<number> {
  const since = windowStart();

  const [row] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(eq(loginAttempts.addressKey, addressKey), gte(loginAttempts.attemptedAt, since)),
    );

  return row?.failures ?? 0;
}

export async function recordLoginFailure(addressKey: string): Promise<void> {
  await db.insert(loginAttempts).values({ addressKey });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, windowStart()));
}

/** Signing in clears the slate, so one good password undoes the lockout. */
export async function clearLoginFailures(addressKey: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.addressKey, addressKey));
}
