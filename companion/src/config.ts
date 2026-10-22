import { DEFAULT_LOCKFILE_PATH } from "./lockfile.ts";

export interface Config {
  websiteUrl: string;
  ingestSecret: string;
  lockfilePath: string;
  rawDumpDir: string;
}

/**
 * Sending is not wired up yet, so a missing website URL or secret is only a
 * warning at this stage — the connection and logging work without them.
 */
export function loadConfig(): Config {
  return {
    websiteUrl: (process.env.WEBSITE_URL ?? "").replace(/\/+$/, ""),
    ingestSecret: process.env.INGEST_SECRET ?? "",
    lockfilePath: process.env.LOCKFILE_PATH ?? DEFAULT_LOCKFILE_PATH,
    rawDumpDir: process.env.RAW_DUMP_DIR ?? "fixtures/raw",
  };
}
