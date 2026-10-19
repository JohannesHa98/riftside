import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("accepts the password it hashed", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("salts, so the same password never hashes the same way twice", async () => {
    const first = await hashPassword("same password");
    const second = await hashPassword("same password");

    expect(first).not.toBe(second);
    expect(await verifyPassword("same password", first)).toBe(true);
    expect(await verifyPassword("same password", second)).toBe(true);
  });

  it("matches a password typed with a different Unicode composition", async () => {
    // "é" as one code point, then as "e" plus a combining accent.
    const hash = await hashPassword("café");

    expect(await verifyPassword("café", hash)).toBe(true);
  });

  it("uses a separator that survives dotenv expansion", async () => {
    // A "$" here would be swallowed by Next.js reading .env.local.
    const hash = await hashPassword("whatever");

    expect(hash).not.toContain("$");
    expect(hash.split(".")).toHaveLength(3);
  });

  it("rejects a malformed or empty stored hash rather than throwing", async () => {
    for (const stored of ["", "nonsense", "scrypt.", "scrypt.abc", "bcrypt.a.b"]) {
      expect(await verifyPassword("anything", stored)).toBe(false);
    }
  });
});
