import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCHEME = "scrypt";

/*
 * "." and not "$": Next.js runs .env values through dotenv-expand, so a "$"
 * in the hash would be read as a variable reference and silently eaten. "."
 * never appears in base64url, so it is a safe separator.
 */
const SEPARATOR = ".";
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hash a password for storage in ADMIN_PASSWORD_HASH.
 *
 * scrypt comes from node:crypto, so there is no native dependency to build on
 * Vercel. The salt is random per hash, so the same password hashes differently
 * every time.
 *
 * Deliberately free of Next.js imports: scripts/hash-password.mjs loads this
 * file directly, so the hashing and the verifying can never drift apart.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = (await scryptAsync(normalise(password), salt, KEY_BYTES)) as Buffer;

  return [SCHEME, salt.toString("base64url"), key.toString("base64url")].join(
    SEPARATOR,
  );
}

/** Constant-time check of a password against a stored hash. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltPart, keyPart] = stored.split(SEPARATOR);
  if (scheme !== SCHEME || !saltPart || !keyPart) return false;

  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(keyPart, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = (await scryptAsync(
    normalise(password),
    salt,
    expected.length,
  )) as Buffer;

  // Lengths match by construction, but timingSafeEqual throws if they differ.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** So a password typed with a different Unicode composition still matches. */
function normalise(password: string): string {
  return password.normalize("NFKC");
}
