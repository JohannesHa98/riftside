/**
 * Validating and placing games sent by the companion app.
 *
 * Pure: no database, no Next.js. The route handler is thin glue around this,
 * so the rules can be tested against saved payloads.
 *
 * Everything arriving here comes from a PC we do not control, holding a shared
 * secret. The secret says "this is our companion", not "this is true", so the
 * payload is validated like any other untrusted input.
 */

import { riotIdKey } from "./riot-id";
import { TEAMS, type Team } from "./types";

export const PLAYERS_PER_GAME = 10;
export const TEAM_SIZE = 5;

/**
 * How far apart a saved suggestion and a finished game can be and still be
 * taken as the same night. Teams are usually saved minutes before the game,
 * but a long evening and a late result should still connect.
 */
export const SUGGESTION_WINDOW_HOURS = 6;

export interface IngestParticipant {
  puuid: string;
  riotId: string;
  gameName: string;
  tagLine: string;
  side: Team;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  clientLane: string | null;
  clientRole: string | null;
  /** The role quest reward item, which says what the game made them. */
  roleQuestItem: number | null;
}

export interface IngestBan {
  side: Team;
  /** Riot uses -1 for a turn where nobody banned. */
  championId: number;
  pickTurn: number;
}

/** Ten in a normal draft; a cap in case a payload is nonsense. */
const MAX_BANS = 20;

export interface IngestGame {
  gameId: number;
  playedAt: Date;
  durationSeconds: number;
  winner: Team | null;
  queueId: number | null;
  gameVersion: string | null;
  participants: IngestParticipant[];
  bans: IngestBan[];
  /** The client's original response, archived as sent. Null if absent. */
  raw: unknown;
}

/**
 * A real game is about 30 KB. The cap is not about disk, it is about a body
 * from a machine we do not control not being able to push anything it likes
 * into the database.
 */
export const MAX_RAW_BYTES = 2_000_000;

export type IngestParse =
  | { ok: true; game: IngestGame }
  | { ok: false; error: string };

export function parseIngestPayload(body: unknown): IngestParse {
  const game = asRecord(body);
  if (game === null) return fail("Body must be a JSON object.");

  const gameId = game.gameId;
  if (!Number.isSafeInteger(gameId) || (gameId as number) <= 0) {
    return fail("gameId must be a positive integer.");
  }

  const playedAt = new Date(String(game.playedAt));
  if (Number.isNaN(playedAt.getTime())) {
    return fail("playedAt must be a date.");
  }

  const durationSeconds = Number(game.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return fail("durationSeconds must be zero or more.");
  }

  const winner = game.winner;
  if (winner !== null && !(TEAMS as readonly unknown[]).includes(winner)) {
    return fail("winner must be blue, red or null.");
  }

  if (!Array.isArray(game.participants) || game.participants.length !== PLAYERS_PER_GAME) {
    return fail(`A game needs exactly ${PLAYERS_PER_GAME} participants.`);
  }

  const participants: IngestParticipant[] = [];
  for (const [index, entry] of game.participants.entries()) {
    const parsed = parseParticipant(entry, index);
    if (!parsed.ok) return parsed;
    participants.push(parsed.participant);
  }

  for (const side of TEAMS) {
    const count = participants.filter((p) => p.side === side).length;
    if (count !== TEAM_SIZE) {
      return fail(`Expected ${TEAM_SIZE} players on ${side}, got ${count}.`);
    }
  }

  const puuids = new Set(participants.map((p) => p.puuid));
  if (puuids.size !== participants.length) {
    return fail("The same player appears twice in that game.");
  }

  return {
    ok: true,
    game: {
      gameId: gameId as number,
      playedAt,
      durationSeconds: Math.round(durationSeconds),
      winner: (winner ?? null) as Team | null,
      queueId: typeof game.queueId === "number" ? game.queueId : null,
      gameVersion: typeof game.gameVersion === "string" ? game.gameVersion : null,
      participants,
      bans: parseBans(game.bans),
      raw: parseRaw(game.raw),
    },
  };
}

/**
 * Kept only if it is a JSON object of a sane size. An older companion sends
 * nothing here, which is fine — the game is still worth having.
 */
function parseRaw(value: unknown): unknown {
  if (asRecord(value) === null) return null;

  try {
    if (JSON.stringify(value).length > MAX_RAW_BYTES) return null;
  } catch {
    // Circular or otherwise unserialisable: not something to store.
    return null;
  }

  return value;
}

/**
 * Bans are optional: a game sent by an older companion simply has none, which
 * is not a reason to reject it.
 */
function parseBans(value: unknown): IngestBan[] {
  if (!Array.isArray(value)) return [];

  const bans: IngestBan[] = [];
  const turnsSeen = new Set<number>();

  for (const entry of value.slice(0, MAX_BANS)) {
    const raw = asRecord(entry);
    if (raw === null) continue;

    if (!(TEAMS as readonly unknown[]).includes(raw.side)) continue;

    const pickTurn = Number(raw.pickTurn);
    if (!Number.isInteger(pickTurn) || turnsSeen.has(pickTurn)) continue;
    turnsSeen.add(pickTurn);

    const championId = Number(raw.championId);
    bans.push({
      side: raw.side as Team,
      championId: Number.isInteger(championId) ? championId : -1,
      pickTurn,
    });
  }

  return bans.sort((a, b) => a.pickTurn - b.pickTurn);
}

type ParticipantParse =
  | { ok: true; participant: IngestParticipant }
  | { ok: false; error: string };

function parseParticipant(entry: unknown, index: number): ParticipantParse {
  const raw = asRecord(entry);
  if (raw === null) return fail(`Participant ${index} is not an object.`);

  const puuid = String(raw.puuid ?? "").trim();
  if (puuid.length === 0) return fail(`Participant ${index} has no puuid.`);

  const side = raw.side;
  if (!(TEAMS as readonly unknown[]).includes(side)) {
    return fail(`Participant ${index} has side "${String(side)}".`);
  }

  const gameName = String(raw.gameName ?? "").trim();
  const tagLine = String(raw.tagLine ?? "").trim();
  const riotId =
    String(raw.riotId ?? "").trim() ||
    (tagLine.length > 0 ? `${gameName}#${tagLine}` : gameName);

  return {
    ok: true,
    participant: {
      puuid,
      riotId,
      gameName,
      tagLine,
      side: side as Team,
      championId: count(raw.championId),
      kills: count(raw.kills),
      deaths: count(raw.deaths),
      assists: count(raw.assists),
      cs: count(raw.cs),
      gold: count(raw.gold),
      damage: count(raw.damage),
      clientLane: optionalText(raw.clientLane),
      clientRole: optionalText(raw.clientRole),
      roleQuestItem: count(raw.roleQuestItem) || null,
    },
  };
}

export interface RosterEntry {
  id: number;
  riotId: string | null;
  puuid: string | null;
}

export interface LinkedParticipant {
  participant: IngestParticipant;
  /** Null when nobody on the roster matches: stored, shown as unlinked. */
  playerId: number | null;
  matchedBy: "puuid" | "riotId" | null;
}

/**
 * PUUID first, Riot ID second. A PUUID never changes; a Riot ID is only a
 * best guess, which is why matching by it is recorded separately — the route
 * uses that to backfill the PUUID so the guess is only ever needed once.
 */
export function linkParticipants(
  participants: readonly IngestParticipant[],
  roster: readonly RosterEntry[],
): LinkedParticipant[] {
  const byPuuid = new Map<string, number>();
  const byRiotId = new Map<string, number>();

  for (const player of roster) {
    if (player.puuid !== null && player.puuid.length > 0) {
      byPuuid.set(player.puuid, player.id);
    }
    const key = riotIdKey(player.riotId);
    if (key !== null) byRiotId.set(key, player.id);
  }

  const taken = new Set<number>();

  return participants.map((participant) => {
    const byId = byPuuid.get(participant.puuid);
    if (byId !== undefined && !taken.has(byId)) {
      taken.add(byId);
      return { participant, playerId: byId, matchedBy: "puuid" as const };
    }

    const key = riotIdKey(participant.riotId);
    const byName = key === null ? undefined : byRiotId.get(key);
    if (byName !== undefined && !taken.has(byName)) {
      taken.add(byName);
      return { participant, playerId: byName, matchedBy: "riotId" as const };
    }

    return { participant, playerId: null, matchedBy: null };
  });
}

export interface SuggestionCandidate {
  id: number;
  playedAt: Date;
  playerIds: number[];
}

/**
 * A suggestion saved on the New game page is already a match row, so a game
 * that turns out to be those same ten players should fill that row in rather
 * than sit beside it as a duplicate.
 *
 * Requires every one of the ten to be linked and the rosters to match exactly:
 * a near miss is a different game, not this one.
 */
export function findSuggestionMatch(
  candidates: readonly SuggestionCandidate[],
  linked: readonly LinkedParticipant[],
  playedAt: Date,
  windowHours = SUGGESTION_WINDOW_HOURS,
): SuggestionCandidate | null {
  const playerIds = linked.map((entry) => entry.playerId);
  if (playerIds.some((id) => id === null)) return null;

  const wanted = new Set(playerIds as number[]);
  if (wanted.size !== PLAYERS_PER_GAME) return null;

  const windowMs = windowHours * 60 * 60 * 1000;

  const withinWindow = candidates.filter(
    (candidate) =>
      Math.abs(candidate.playedAt.getTime() - playedAt.getTime()) <= windowMs &&
      candidate.playerIds.length === wanted.size &&
      candidate.playerIds.every((id) => wanted.has(id)),
  );

  if (withinWindow.length === 0) return null;

  // Several suggestions can be saved on one evening; the closest in time to
  // the finished game is the one it belongs to.
  return withinWindow.reduce((best, candidate) =>
    Math.abs(candidate.playedAt.getTime() - playedAt.getTime()) <
    Math.abs(best.playedAt.getTime() - playedAt.getTime())
      ? candidate
      : best,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0;
}

function optionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length === 0 || value === null ? null : text;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
