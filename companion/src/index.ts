import { loadConfig, type Config } from "./config.ts";
import { watchGameflow } from "./events.ts";
import { LcuClient } from "./lcu.ts";
import { readLockfile, type Lockfile } from "./lockfile.ts";
import {
  inHouseCandidates,
  isInHouseGame,
  parseGame,
  type GamePayload,
  type HistoryGame,
} from "./parse.ts";
import { outline, probeEndpoints, writeRawDump, writeRawDumps } from "./probe.ts";
import { sendGame } from "./send.ts";

const RETRY_MS = 4000;
const MATCH_HISTORY_PATH =
  "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19";

/** How long to keep looking for a finished game to appear in the history. */
const SETTLE_ATTEMPTS = 12;
const SETTLE_GAP_MS = 5000;

type Mode = "watch" | "backfill" | "probe";

const MODE: Mode = process.argv.includes("--probe-only")
  ? "probe"
  : process.argv.includes("--backfill")
    ? "backfill"
    : "watch";

main().catch((error) => {
  log(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main(): Promise<void> {
  const config = loadConfig();

  log("In-house companion — read-only. It never sends anything to the client.");
  log(`Mode: ${MODE}`);
  log(`Lockfile: ${config.lockfilePath}`);

  if (MODE !== "probe") {
    if (config.websiteUrl.length === 0 || config.ingestSecret.length === 0) {
      throw new Error(
        "WEBSITE_URL and INGEST_SECRET must both be set in companion/.env.",
      );
    }
    log(`Website: ${config.websiteUrl}`);
  }

  for (;;) {
    const lockfile = await waitForClient(config.lockfilePath);
    log(`Client found on port ${lockfile.port} (pid ${lockfile.pid}).`);
    const client = new LcuClient(lockfile);

    try {
      if (MODE === "probe") {
        await runProbe(client, config);
        return;
      }

      if (MODE === "backfill") {
        await runBackfill(client, config);
        return;
      }

      await runWatch(client, config);
    } catch (error) {
      log(`Lost the client: ${describe(error)}`);
    }

    if (MODE !== "watch") return;

    log("Waiting for the client to come back…");
    await delay(RETRY_MS);
  }
}

/** Polls until the lockfile appears. The client may not be running yet. */
async function waitForClient(path: string): Promise<Lockfile> {
  let announced = false;

  for (;;) {
    const lockfile = await readLockfile(path);
    if (lockfile !== null) return lockfile;

    if (!announced) {
      log("League client is not running. Waiting for it…");
      announced = true;
    }

    await delay(RETRY_MS);
  }
}

async function runWatch(client: LcuClient, config: Config): Promise<void> {
  // Watching looks forward only, so remember where "now" is. Purely in
  // memory: a file would go stale the moment a game is deleted on the site.
  let newestAtStart = 0;
  try {
    newestAtStart = (await listCandidates(client))[0]?.gameId ?? 0;
  } catch {
    // The history will be read again when a game ends.
  }

  log("Watching for games to finish. Leave this running.");

  await new Promise<void>((resolve) => {
    let busy = false;

    const stop = watchGameflow(client, {
      onOpen: () => log("Subscribed to client events."),
      onPhase: (event) => {
        log(`Gameflow phase: ${event.phase}`);
        if (event.phase !== "EndOfGame" || busy) return;

        busy = true;
        void collectFinishedGame(client, config, newestAtStart)
          .then((sent) => {
            if (sent !== null) newestAtStart = sent;
          })
          .catch((error) => log(`  could not collect that game: ${describe(error)}`))
          .finally(() => {
            busy = false;
          });
      },
      onClose: (reason) => {
        stop();
        resolve();
        log(`Event socket closed (${reason}).`);
      },
    });
  });
}

/**
 * A game does not appear in the match history the instant it ends, so this
 * keeps looking for a little while rather than giving up on the first miss.
 * Returns the game id it sent, or null.
 */
async function collectFinishedGame(
  client: LcuClient,
  config: Config,
  newestAlreadySeen: number,
): Promise<number | null> {
  log("A game finished. Looking for it in the match history…");

  for (let attempt = 1; attempt <= SETTLE_ATTEMPTS; attempt++) {
    const fresh = (await listCandidates(client)).find(
      (game) => game.gameId > newestAlreadySeen,
    );

    if (fresh !== undefined) {
      await fetchAndSend(client, config, fresh);
      return fresh.gameId;
    }

    await delay(SETTLE_GAP_MS);
  }

  log("  gave up waiting for it to appear. `npm run backfill` will catch it.");
  return null;
}

async function runBackfill(client: LcuClient, config: Config): Promise<void> {
  // Oldest first, so history fills in the order the games were played. Every
  // game is offered to the website, which is the one that knows what it
  // already has — a local list would be wrong the moment a game is deleted
  // there.
  const games = (await listCandidates(client)).reverse();

  log(`Match history holds ${games.length} in-house game(s). Offering each one…`);

  for (const game of games) {
    await fetchAndSend(client, config, game);
  }

  log("Backfill finished.");
}

async function listCandidates(client: LcuClient): Promise<HistoryGame[]> {
  const response = await client.get(MATCH_HISTORY_PATH);
  if (response.status !== 200) {
    throw new Error(`Match history answered ${response.status}.`);
  }

  return inHouseCandidates(response.body);
}

async function fetchAndSend(
  client: LcuClient,
  config: Config,
  game: HistoryGame,
): Promise<void> {
  log(`Game ${game.gameId} (${Math.round(game.durationSeconds / 60)} min):`);

  const response = await client.get(`/lol-match-history/v1/games/${game.gameId}`);
  if (response.status !== 200) {
    log(`  the client answered ${response.status}; leaving it for next time.`);
    return;
  }

  // The list says custom/CLASSIC/Rift, but only the detail carries all ten
  // players, so the ten-player rule is checked here.
  if (!isInHouseGame(response.body)) {
    log("  not an in-house game after all. Skipping it.");
    return;
  }

  let payload: GamePayload;
  try {
    payload = parseGame(response.body);
  } catch (error) {
    // Keep the raw response: if Riot changed a field, this is the evidence.
    const file = await writeRawDump(
      `unparsed-${game.gameId}`,
      response.body,
      config.rawDumpDir,
    );
    log(`  could not read it: ${describe(error)}`);
    log(`  saved the raw response to ${file}`);
    return;
  }

  const outcome = await sendGame(config, payload, log);

  switch (outcome.status) {
    case "sent":
      log(
        `  sent. match ${outcome.matchId}, ${outcome.linked} linked` +
          (outcome.unlinked > 0 ? `, ${outcome.unlinked} unlinked` : ""),
      );
      break;

    case "duplicate":
      log(`  the website already had it (match ${outcome.matchId}).`);
      break;

    case "refused":
      log(`  the website refused it (${outcome.code}): ${outcome.error}`);
      break;
  }
}

async function runProbe(client: LcuClient, config: Config): Promise<void> {
  const results = await probeEndpoints(client);

  log("");
  log("Endpoints:");
  for (const result of results) {
    const mark = result.status === 200 ? "ok  " : "fail";
    log(`  [${mark}] ${result.status || "---"}  ${result.path}`);
  }

  const written = await writeRawDumps(results, config.rawDumpDir);
  log("");
  log(`Wrote ${written.length} raw response(s) to ${config.rawDumpDir}/`);

  log("");
  log("Shape of what came back (values shortened; full JSON is on disk):");
  for (const result of results) {
    if (result.status !== 200) continue;
    log("");
    log(`--- ${result.slug} (${result.path})`);
    log(indent(result.outline));
  }

  const history = results.find(
    (result) => result.slug.startsWith("match-history") && result.status === 200,
  );
  if (history === undefined) return;

  const candidate = inHouseCandidates(history.body)[0];
  if (candidate === undefined) {
    log("");
    log("No in-house game in the recent history to dump.");
    return;
  }

  const detail = await client.get(`/lol-match-history/v1/games/${candidate.gameId}`);
  if (detail.status !== 200) return;

  const file = await writeRawDump(
    "game-detail-custom-sr",
    detail.body,
    config.rawDumpDir,
  );
  log("");
  log(`Newest in-house game written to ${file}`);
  log(indent(outline(detail.body)));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function indent(text: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(message);
}
