import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A stand-in for the Next.js cookie jar, which only exists in a request. */
const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name)! } : undefined,
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const SECRET = "test-secret-at-least-32-characters-long";
process.env.AUTH_SECRET = SECRET;

const { hashPassword } = await import("./password");
const { SESSION_COOKIE, isSignedIn, requireSignedIn, signInWithPassword, signOut } =
  await import("./auth");

const PASSWORD = "a-long-enough-test-password";
process.env.ADMIN_PASSWORD_HASH = await hashPassword(PASSWORD);

async function tokenSignedWith(secret: string, expiresAt: string | number) {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
}

beforeEach(() => {
  jar.clear();
  process.env.AUTH_SECRET = SECRET;
});

describe("signing in", () => {
  it("accepts the right password and leaves a session behind", async () => {
    expect(await signInWithPassword(PASSWORD)).toBe(true);
    expect(await isSignedIn()).toBe(true);
  });

  it("rejects the wrong password and sets no cookie", async () => {
    expect(await signInWithPassword("not the password")).toBe(false);
    expect(jar.size).toBe(0);
    expect(await isSignedIn()).toBe(false);
  });

  it("signs out again", async () => {
    await signInWithPassword(PASSWORD);
    await signOut();

    expect(await isSignedIn()).toBe(false);
  });
});

describe("session validation", () => {
  it("treats a missing cookie as signed out", async () => {
    expect(await isSignedIn()).toBe(false);
  });

  it("rejects a cookie that is not a token at all", async () => {
    jar.set(SESSION_COOKIE, "not-a-jwt");

    expect(await isSignedIn()).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    jar.set(SESSION_COOKIE, await tokenSignedWith("a-different-secret-32-chars-long!!", "1h"));

    expect(await isSignedIn()).toBe(false);
  });

  it("rejects an expired token", async () => {
    jar.set(
      SESSION_COOKIE,
      await tokenSignedWith(SECRET, Math.floor(Date.now() / 1000) - 60),
    );

    expect(await isSignedIn()).toBe(false);
  });

  it("rejects an unsigned token claiming alg none", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ admin: true, exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    jar.set(SESSION_COOKIE, `${header}.${payload}.`);

    expect(await isSignedIn()).toBe(false);
  });

  it("reads as signed out when AUTH_SECRET is missing, rather than throwing", async () => {
    await signInWithPassword(PASSWORD);
    delete process.env.AUTH_SECRET;

    await expect(isSignedIn()).resolves.toBe(false);
  });
});

describe("requireSignedIn", () => {
  it("throws when signed out", async () => {
    await expect(requireSignedIn()).rejects.toThrow(/signed in/);
  });

  it("resolves when signed in", async () => {
    await signInWithPassword(PASSWORD);

    await expect(requireSignedIn()).resolves.toBeUndefined();
  });
});
