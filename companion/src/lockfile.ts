import { readFile } from "node:fs/promises";

/**
 * The League client writes a lockfile while it is running and deletes it on
 * exit. It holds everything needed to talk to the local API.
 *
 * Format is five colon-separated fields:
 *   LeagueClient:<pid>:<port>:<password>:<protocol>
 *
 * The password changes every time the client restarts, so this is re-read
 * rather than cached.
 */
export interface Lockfile {
  processName: string;
  pid: number;
  port: number;
  password: string;
  protocol: string;
}

export const DEFAULT_LOCKFILE_PATH =
  "C:\\Riot Games\\League of Legends\\lockfile";

export function parseLockfile(contents: string): Lockfile {
  const fields = contents.trim().split(":");

  if (fields.length < 5) {
    throw new Error(
      `Lockfile has ${fields.length} fields, expected 5. Riot may have changed the format.`,
    );
  }

  // The password is field 4, but split on every colon in case a future field
  // is appended; take the last as protocol and rebuild anything between.
  const [processName, pid, port] = fields;
  const protocol = fields[fields.length - 1];
  const password = fields.slice(3, fields.length - 1).join(":");

  const parsedPort = Number(port);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Lockfile port "${port}" is not a number.`);
  }

  if (password.length === 0) {
    throw new Error("Lockfile has an empty password.");
  }

  return {
    processName,
    pid: Number(pid),
    port: parsedPort,
    password,
    protocol,
  };
}

/** Null when the client is not running, rather than throwing. */
export async function readLockfile(path: string): Promise<Lockfile | null> {
  try {
    return parseLockfile(await readFile(path, "utf8"));
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
