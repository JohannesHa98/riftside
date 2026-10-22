import { request } from "node:https";

import type { Lockfile } from "./lockfile.ts";

/**
 * Minimal client for the League Client Update (LCU) API.
 *
 * The client serves HTTPS on localhost with a self-signed certificate, so
 * verification has to be turned off — but only ever for 127.0.0.1. Every
 * request asserts that before relaxing anything, so a mistake elsewhere can
 * never silently disable verification against a real host.
 */
const LOOPBACK = "127.0.0.1";

export interface LcuResponse {
  status: number;
  /** Parsed JSON when the body was JSON, otherwise the raw text. */
  body: unknown;
}

export class LcuClient {
  // Written out rather than a constructor parameter property: Node runs this
  // TypeScript by stripping types, and a parameter property would have to be
  // compiled, not erased.
  readonly lockfile: Lockfile;

  constructor(lockfile: Lockfile) {
    this.lockfile = lockfile;
  }

  get origin(): string {
    return `https://${LOOPBACK}:${this.lockfile.port}`;
  }

  get authHeader(): string {
    // The username is always "riot"; the password comes from the lockfile.
    const token = Buffer.from(`riot:${this.lockfile.password}`).toString(
      "base64",
    );
    return `Basic ${token}`;
  }

  /** GET a path such as "/lol-summoner/v1/current-summoner". */
  get(path: string): Promise<LcuResponse> {
    if (!path.startsWith("/")) {
      throw new Error(`LCU path must start with "/", got "${path}".`);
    }

    return new Promise((resolve, reject) => {
      const call = request(
        {
          host: LOOPBACK,
          port: this.lockfile.port,
          path,
          method: "GET",
          headers: { Authorization: this.authHeader, Accept: "application/json" },
          // Safe only because the host is pinned to loopback above.
          rejectUnauthorized: false,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              status: response.statusCode ?? 0,
              body: tryParseJson(text),
            });
          });
        },
      );

      call.on("error", reject);
      call.end();
    });
  }
}

function tryParseJson(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
