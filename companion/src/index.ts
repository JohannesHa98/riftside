import { loadConfig, type Config } from "./config.ts";
import { watchGameflow } from "./events.ts";
import { LcuClient } from "./lcu.ts";
import { readLockfile, type Lockfile } from "./lockfile.ts";
import { inHouseCandidates, listHistoryGames, type HistoryGame } from "./parse.ts";
import { outline, probeEndpoints, writeRawDump, writeRawDumps } from "./probe.ts";

const RETRY_MS = 4000;
const PROBE_ONLY = process.argv.includes("--probe-only");

main().catch((error) => {
  log(`Stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

async function main(): Promise<void> {
  const config = loadConfig();

  log("In-house companion — read-only. It never sends anything to the client.");
  log(`Lockfile: ${config.lockfilePath}`);
  if (config.websiteUrl.length === 0 || config.ingestSecret.length === 0) {
    log("Note: WEBSITE_URL / INGEST_SECRET not set. Fine for now — nothing is sent yet.");
  }

  for (;;) {
    const lockfile = await waitForClient(config.lockfilePath);
    log(`Client found on port ${lockfile.port} (pid ${lockfile.pid}).`);

    try {
      await runSession(new LcuClient(lockfile), config);
      if (PROBE_ONLY) return;
    } catch (error) {
      log(`Lost the client: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (PROBE_ONLY) return;

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

async function runSession(client: LcuClient, config: Config): Promise<void> {
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

  // Match history is the one that matters most, so follow it one level deeper
  // and pull a single game's detail — using whatever ids are actually present
  // rather than assuming a field name.
  await dumpOneGameDetail(client, config, results);

  if (PROBE_ONLY) return;

  log("");
  log("Watching for games to finish. Leave this running.");

  await new Promise<void>((resolve) => {
    const stop = watchGameflow(client, {
      onOpen: () => log("Subscribed to client events."),
      onPhase: (event) => {
        log(`Gameflow phase: ${event.phase}`);
        void onPhase(client, config, event.phase);
      },
      onClose: (reason) => {
        stop();
        resolve();
        log(`Event socket closed (${reason}).`);
      },
    });
  });
}

async function onPhase(
  client: LcuClient,
  config: Config,
  phase: string,
): Promise<void> {
  // Step 1 only observes. Which phase means "finished" gets decided from the
  // real sequence we see logged here, not from memory.
  if (phase !== "EndOfGame" && phase !== "PreEndOfGame") return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  log(`Game finished (${phase}). Dumping what the client has…`);

  for (const [name, path] of [
    ["eog-stats-block", "/lol-end-of-game/v1/eog-stats-block"],
    [
      "match-history",
      "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19",
    ],
  ] as const) {
    try {
      const response = await client.get(path);
      if (response.status !== 200) {
        log(`  ${name}: ${response.status}`);
        continue;
      }

      const file = await writeRawDump(`${name}-${stamp}`, response.body, config.rawDumpDir);
      log(`  ${name}: written to ${file}`);
      log(indent(outline(response.body), 4));
    } catch (error) {
      log(`  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function dumpOneGameDetail(
  client: LcuClient,
  config: Config,
  results: Awaited<ReturnType<typeof probeEndpoints>>,
): Promise<void> {
  const history = results.find(
    (result) => result.slug.startsWith("match-history") && result.status === 200,
  );
  if (history === undefined) {
    log("");
    log("No match history endpoint answered, so no game detail to fetch.");
    return;
  }

  const games = listHistoryGames(history.body);
  if (games.length === 0) {
    log("");
    log("Match history answered but held no games, so nothing to follow.");
    return;
  }

  log("");
  log(`Match history holds ${games.length} game(s):`);
  for (const game of games) {
    log(
      `  ${game.gameId}  ${game.gameType}/${game.gameMode}  map ${game.mapId}  ${game.durationSeconds}s`,
    );
  }

  // The newest game may be an ARAM or a practice session. The fixture worth
  // keeping is an in-house candidate: a custom game on Summoner's Rift.
  const wanted: Array<{ name: string; game: HistoryGame | undefined }> = [
    { name: "game-detail-newest", game: games[0] },
    { name: "game-detail-custom-sr", game: inHouseCandidates(history.body)[0] },
  ];

  for (const { name, game } of wanted) {
    if (game === undefined) {
      log("");
      log(`No game found for ${name}.`);
      continue;
    }

    const path = `/lol-match-history/v1/games/${game.gameId}`;
    const response = await client.get(path);
    log("");
    log(`  [${response.status === 200 ? "ok  " : "fail"}] ${response.status} ${path}`);
    if (response.status !== 200) continue;

    const file = await writeRawDump(name, response.body, config.rawDumpDir);
    log(`  written to ${file}`);
    log(`--- ${name}`);
    log(indent(outline(response.body)));
  }
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
