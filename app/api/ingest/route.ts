import { timingSafeEqual } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, matchBans, matchPlayers, matches, players } from "@/db";
import {
  linkParticipants,
  parseIngestPayload,
  type IngestGame,
  type LinkedParticipant,
} from "@/lib/ingest";

/**
 * Receives finished in-house games from the companion app.
 *
 * The shared secret lives on a player's PC, so it proves "this came from our
 * companion", not "this is true". Everything in the body is validated, and
 * the route only ever writes a game — it cannot change players or delete
 * anything.
 */
export async function POST(request: Request): Promise<Response> {
  if (!authorised(request)) {
    return json({ error: "Not authorised." }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const parsed = parseIngestPayload(body);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }

  const game = parsed.game;

  // Idempotent by Riot's game id, so a retry or an overlapping backfill is
  // harmless rather than a duplicate row.
  const [duplicate] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.riotGameId, game.gameId))
    .limit(1);

  if (duplicate !== undefined) {
    // Bans were added after some games had already been sent. Filling them
    // in on a repeat send is free and saves deleting and re-sending a game
    // just to pick up data we did not used to store.
    const addedBans = await storeBansIfMissing(duplicate.id, game);
    const addedRaw = await storeRawIfMissing(duplicate.id, game);

    return json(
      {
        status: "duplicate",
        matchId: duplicate.id,
        bansAdded: addedBans,
        rawAdded: addedRaw,
      },
      200,
    );
  }

  const roster = await db
    .select({
      id: players.id,
      riotId: players.riotId,
      puuid: players.puuid,
      power: players.power,
    })
    .from(players);

  const linked = linkParticipants(game.participants, roster);
  const powerById = new Map(roster.map((player) => [player.id, player.power]));

  let matchId: number;
  try {
    matchId = await createMatch(game, linked, powerById);
  } catch (error) {
    // Two companions can send the same game at the same moment and both get
    // past the check above. riot_game_id is UNIQUE, so the database refuses
    // the second write — which is the real guarantee that one game can only
    // ever be one row. Report it as the duplicate it is, not a failure.
    if (!isDuplicateGame(error)) throw error;

    const [existing] = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.riotGameId, game.gameId))
      .limit(1);

    return json({ status: "duplicate", matchId: existing?.id ?? null }, 200);
  }

  await storeBansIfMissing(matchId, game);
  await backfillPuuids(linked);

  revalidatePath("/history");
  revalidatePath("/stats");
  revalidatePath("/players");

  return json(
    {
      status: "created",
      matchId,
      linked: linked.filter((entry) => entry.playerId !== null).length,
      unlinked: linked.filter((entry) => entry.playerId === null).length,
    },
    201,
  );
}

/**
 * Writes the bans, unless this match already has some. Separate from the
 * match write so a repeat send can fill in what an older companion did not
 * know to send.
 */
async function storeBansIfMissing(
  matchId: number,
  game: IngestGame,
): Promise<number> {
  if (game.bans.length === 0) return 0;

  const [existing] = await db
    .select({ id: matchBans.id })
    .from(matchBans)
    .where(eq(matchBans.matchId, matchId))
    .limit(1);

  if (existing !== undefined) return 0;

  await db.insert(matchBans).values(
    game.bans.map((ban) => ({
      matchId,
      team: ban.side,
      championId: ban.championId,
      pickTurn: ban.pickTurn,
    })),
  );

  return game.bans.length;
}

/**
 * Fills in the archived response for a game sent before the column existed.
 * Never overwrites one already stored.
 */
async function storeRawIfMissing(
  matchId: number,
  game: IngestGame,
): Promise<boolean> {
  if (game.raw === null) return false;

  const [existing] = await db
    .select({ rawPayload: matches.rawPayload })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (existing === undefined || existing.rawPayload !== null) return false;

  await db
    .update(matches)
    .set({ rawPayload: game.raw })
    .where(eq(matches.id, matchId));

  return true;
}

/** Postgres unique-violation on matches.riot_game_id. */
function isDuplicateGame(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function authorised(request: Request): boolean {
  const expected = process.env.INGEST_SECRET ?? "";
  if (expected.length === 0) return false;

  const given = request.headers.get("x-ingest-secret") ?? "";
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch, so that is checked first.
  // It leaks the secret's length and nothing else.
  return a.length === b.length && timingSafeEqual(a, b);
}

async function createMatch(
  game: IngestGame,
  linked: LinkedParticipant[],
  powerById: Map<number, number>,
): Promise<number> {
  const [match] = await db
    .insert(matches)
    .values({
      playedAt: game.playedAt,
      winner: game.winner,
      riotGameId: game.gameId,
      durationSeconds: game.durationSeconds,
      source: "riot",
      rawPayload: game.raw,
    })
    .returning({ id: matches.id });

  try {
    await db.insert(matchPlayers).values(
      linked.map((entry) => ({
        matchId: match.id,
        playerId: entry.playerId,
        team: entry.participant.side,
        powerAtTime:
          entry.playerId === null ? null : (powerById.get(entry.playerId) ?? null),
        ...statsOf(entry),
      })),
    );
  } catch (error) {
    // The driver has no interactive transactions, so undo the half-written
    // match rather than leaving an empty one behind.
    await db.delete(matches).where(eq(matches.id, match.id));
    throw error;
  }

  return match.id;
}

function statsOf(entry: LinkedParticipant) {
  const { participant } = entry;

  return {
    puuid: participant.puuid,
    riotId: participant.riotId,
    championId: participant.championId,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    cs: participant.cs,
    gold: participant.gold,
    damage: participant.damage,
    clientLane: participant.clientLane,
    clientRole: participant.clientRole,
    roleQuestItem: participant.roleQuestItem,
  };
}

/**
 * Someone matched by Riot ID has no PUUID on file yet. Recording it now means
 * the name-based guess is only ever needed once, and renaming stops mattering.
 */
async function backfillPuuids(linked: LinkedParticipant[]): Promise<void> {
  for (const entry of linked) {
    if (entry.playerId === null || entry.matchedBy !== "riotId") continue;

    await db
      .update(players)
      .set({ puuid: entry.participant.puuid })
      .where(and(eq(players.id, entry.playerId), isNull(players.puuid)));
  }
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}
