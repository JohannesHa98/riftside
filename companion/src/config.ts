import { DEFAULT_LOCKFILE_PATH } from "./lockfile.ts";

export interface Config {
  websiteUrl: string;
  ingestSecret: string;
  lockfilePath: string;
  rawDumpDir: string;
  sentStorePath: string;
}

/**
 * The website URL and secret are only needed for sending, so they are read
 * here and checked by the caller — `--probe-only` works without them.
 */
export function loadConfig(): Config {
  return {
    websiteUrl: (process.env.WEBSITE_URL ?? "").replace(/\/+$/, ""),
    ingestSecret: process.env.INGEST_SECRET ?? "",
    lockfilePath: process.env.LOCKFILE_PATH ?? DEFAULT_LOCKFILE_PATH,
    rawDumpDir: process.env.RAW_DUMP_DIR ?? "fixtures/raw",
    sentStorePath: process.env.SENT_STORE_PATH ?? "sent-games.json",
  };
}
