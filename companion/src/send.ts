import type { Config } from "./config.ts";
import type { GamePayload } from "./parse.ts";

/**
 * Posts a finished game to the website.
 *
 * The website is idempotent on game id, so retrying is always safe. A refusal
 * (4xx) is not retried: sending the same rejected payload again will be
 * rejected again, and hammering it would only hide the problem.
 */
const MAX_ATTEMPTS = 5;
const FIRST_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;

export type SendOutcome =
  | { status: "sent"; matchId: number; linked: number; unlinked: number }
  | { status: "duplicate"; matchId: number }
  | { status: "refused"; code: number; error: string };

export async function sendGame(
  config: Config,
  game: GamePayload,
  log: (message: string) => void = () => {},
): Promise<SendOutcome> {
  const url = `${config.websiteUrl}/api/ingest`;
  let backoff = FIRST_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ingest-secret": config.ingestSecret,
        },
        body: JSON.stringify(game),
      });
    } catch (error) {
      // The website is unreachable: offline, asleep, or mid-deploy.
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) {
        return { status: "refused", code: 0, error: reason };
      }
      log(`  could not reach the website (${reason}); retrying in ${backoff / 1000}s`);
      await delay(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }

    const body = await readJson(response);

    if (response.ok) {
      if (body.status === "duplicate") {
        return { status: "duplicate", matchId: Number(body.matchId) };
      }
      return {
        status: "sent",
        matchId: Number(body.matchId),
        linked: Number(body.linked ?? 0),
        unlinked: Number(body.unlinked ?? 0),
      };
    }

    // 5xx and 429 are worth another go; anything else is our fault, not a blip.
    const worthRetrying = response.status >= 500 || response.status === 429;
    if (!worthRetrying || attempt === MAX_ATTEMPTS) {
      return {
        status: "refused",
        code: response.status,
        error: String(body.error ?? `HTTP ${response.status}`),
      };
    }

    log(`  website answered ${response.status}; retrying in ${backoff / 1000}s`);
    await delay(backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }

  return { status: "refused", code: 0, error: "Ran out of attempts." };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
