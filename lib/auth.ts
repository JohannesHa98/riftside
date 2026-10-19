import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { verifyPassword } from "./password";

/** Exported so the tests can forge cookies to check they are rejected. */
export const SESSION_COOKIE = "inhouse_session";
const SESSION_DAYS = 30;
const ALGORITHM = "HS256";

/**
 * There is exactly one account: whoever knows ADMIN_PASSWORD_HASH's password.
 * The session is a signed JWT in an HttpOnly cookie, so there is no session
 * table to keep and nothing for page scripts to read. Signing out clears the
 * cookie; to revoke every session at once, rotate AUTH_SECRET.
 */
function signingKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short — it needs at least 32 characters.",
    );
  }

  return new TextEncoder().encode(secret);
}

export async function signInWithPassword(password: string): Promise<boolean> {
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!stored) {
    throw new Error("ADMIN_PASSWORD_HASH is not set, so nobody can sign in.");
  }

  if (!(await verifyPassword(password, stored))) return false;

  await startSession();
  return true;
}

async function startSession(): Promise<void> {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(signingKey());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Whether the current request carries a valid session. Never throws: a missing
 * or misconfigured secret has to read as "signed out" rather than as an error
 * that might be mistaken for success.
 */
export async function isSignedIn(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return false;

    // Pinning the algorithm is what stops a forged header naming another one.
    await jwtVerify(token, signingKey(), { algorithms: [ALGORITHM] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Guard for every mutating server action. Server actions are reachable by
 * direct POST, so hiding a button in the UI protects nothing — this is the
 * check that does.
 */
export async function requireSignedIn(): Promise<void> {
  if (!(await isSignedIn())) {
    throw new Error("You have to be signed in to change anything.");
  }
}
