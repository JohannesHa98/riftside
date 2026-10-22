/**
 * Every assumption about the League client's data lives here.
 *
 * The LCU API is unofficial and undocumented: field names are not guaranteed
 * and have no deprecation policy. Everything below was read off a real client
 * (see fixtures/), not from memory. When Riot changes something, this is the
 * only file that should need touching — which is why it has no imports and no
 * I/O, and why the tests run against saved responses.
 */

export const SUMMONERS_RIFT = 11;
export const CUSTOM_GAME = "CUSTOM_GAME";
export const CLASSIC = "CLASSIC";
export const PLAYERS_PER_GAME = 10;

export type Side = "blue" | "red";

/** The client numbers the sides 100 and 200. */
const SIDE_BY_TEAM_ID: Record<number, Side> = { 100: "blue", 200: "red" };

export interface ParticipantPayload {
  puuid: string;
  /** gameName#tagLine, the modern Riot ID. */
  riotId: string;
  gameName: string;
  tagLine: string;
  side: Side;
  championId: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  /**
   * The client's *guess* at where someone played, not a fact. It is derived
   * from movement and is reliably wrong in custom games — a real in-house
   * game came back with two junglers, two mids and no top. Stored as-is and
   * deliberately not mapped onto our roles.
   */
  clientLane: string | null;
  clientRole: string | null;
}

export interface BanPayload {
  side: Side;
  /** Riot uses -1 for a turn where nobody banned. */
  championId: number;
  pickTurn: number;
}

export interface GamePayload {
  gameId: number;
  /** ISO 8601, when the game started. */
  playedAt: string;
  durationSeconds: number;
  /** Null if neither side is marked as the winner, e.g. an aborted game. */
  winner: Side | null;
  queueId: number | null;
  gameVersion: string | null;
  participants: ParticipantPayload[];
  bans: BanPayload[];
}

export interface HistoryGame {
  gameId: number;
  gameType: string;
  gameMode: string;
  mapId: number;
  durationSeconds: number;
}

export class ParseError extends Error {}

/**
 * An in-house game: a custom game on Summoner's Rift with ten players.
 *
 * This is what separates our games from ARAM customs (mode KIWI, map 12) and
 * practice tool sessions (mode PRACTICETOOL), both of which are also
 * CUSTOM_GAME and both of which appear in a real match history.
 */
export function isInHouseGame(raw: unknown): boolean {
  const game = asRecord(raw);
  if (game === null) return false;

  const participants = game.participants;

  return (
    game.gameType === CUSTOM_GAME &&
    game.gameMode === CLASSIC &&
    Number(game.mapId) === SUMMONERS_RIFT &&
    Array.isArray(participants) &&
    participants.length === PLAYERS_PER_GAME
  );
}

/**
 * The list endpoint only carries the current summoner as a participant, so
 * these are just ids to follow up with — never enough to send on their own.
 */
export function listHistoryGames(raw: unknown): HistoryGame[] {
  const body = asRecord(raw);
  const games = asRecord(body?.games)?.games;
  if (!Array.isArray(games)) return [];

  return games
    .map(asRecord)
    .filter((game): game is Record<string, unknown> => game !== null)
    .filter((game) => typeof game.gameId === "number")
    .map((game) => ({
      gameId: game.gameId as number,
      gameType: String(game.gameType ?? ""),
      gameMode: String(game.gameMode ?? ""),
      mapId: Number(game.mapId ?? -1),
      durationSeconds: Number(game.gameDuration ?? 0),
    }))
    .sort((a, b) => b.gameId - a.gameId);
}

/** Candidate in-house games from the history list, newest first. */
export function inHouseCandidates(raw: unknown): HistoryGame[] {
  return listHistoryGames(raw).filter(
    (game) =>
      game.gameType === CUSTOM_GAME &&
      game.gameMode === CLASSIC &&
      game.mapId === SUMMONERS_RIFT,
  );
}

/** Parse a full game, or throw explaining exactly what was missing. */
export function parseGame(raw: unknown): GamePayload {
  const game = asRecord(raw);
  if (game === null) throw new ParseError("Game is not an object.");

  const gameId = game.gameId;
  if (typeof gameId !== "number") {
    throw new ParseError("Game has no numeric gameId.");
  }

  if (!isInHouseGame(game)) {
    throw new ParseError(
      `Game ${gameId} is not an in-house game ` +
        `(type ${String(game.gameType)}, mode ${String(game.gameMode)}, ` +
        `map ${String(game.mapId)}, ` +
        `${Array.isArray(game.participants) ? game.participants.length : 0} players).`,
    );
  }

  return {
    gameId,
    playedAt: parsePlayedAt(game, gameId),
    durationSeconds: Number(game.gameDuration ?? 0),
    winner: parseWinner(game.teams),
    queueId: typeof game.queueId === "number" ? game.queueId : null,
    gameVersion:
      typeof game.gameVersion === "string" ? game.gameVersion : null,
    participants: parseParticipants(game, gameId),
    bans: parseBans(game.teams),
  };
}

/** Bans hang off each team, with pickTurn giving the order across both. */
function parseBans(teams: unknown): BanPayload[] {
  if (!Array.isArray(teams)) return [];

  const bans: BanPayload[] = [];

  for (const entry of teams) {
    const team = asRecord(entry);
    if (team === null) continue;

    const side = SIDE_BY_TEAM_ID[Number(team.teamId)];
    if (side === undefined || !Array.isArray(team.bans)) continue;

    for (const banEntry of team.bans) {
      const ban = asRecord(banEntry);
      if (ban === null) continue;

      const pickTurn = Number(ban.pickTurn);
      if (!Number.isFinite(pickTurn)) continue;

      bans.push({ side, championId: count(ban.championId), pickTurn });
    }
  }

  return bans.sort((a, b) => a.pickTurn - b.pickTurn);
}

function parsePlayedAt(game: Record<string, unknown>, gameId: number): string {
  if (typeof game.gameCreationDate === "string") {
    const parsed = new Date(game.gameCreationDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // Older payloads only carry the epoch milliseconds.
  if (typeof game.gameCreation === "number") {
    const parsed = new Date(game.gameCreation);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  throw new ParseError(`Game ${gameId} has no usable creation date.`);
}

/** teams[].win is the string "Win" or "Fail", not a boolean. */
function parseWinner(teams: unknown): Side | null {
  if (!Array.isArray(teams)) return null;

  for (const entry of teams) {
    const team = asRecord(entry);
    if (team === null) continue;
    if (String(team.win).toLowerCase() !== "win") continue;

    const side = SIDE_BY_TEAM_ID[Number(team.teamId)];
    if (side !== undefined) return side;
  }

  return null;
}

function parseParticipants(
  game: Record<string, unknown>,
  gameId: number,
): ParticipantPayload[] {
  const participants = game.participants as unknown[];
  const identities = Array.isArray(game.participantIdentities)
    ? game.participantIdentities
    : [];

  // Identities are a parallel list joined on participantId, not by position.
  const playerByParticipantId = new Map<number, Record<string, unknown>>();
  for (const entry of identities) {
    const identity = asRecord(entry);
    const player = asRecord(identity?.player);
    if (identity === null || player === null) continue;
    playerByParticipantId.set(Number(identity.participantId), player);
  }

  return participants.map((entry) => {
    const participant = asRecord(entry);
    if (participant === null) {
      throw new ParseError(`Game ${gameId} has a participant that is not an object.`);
    }

    const participantId = Number(participant.participantId);
    const player = playerByParticipantId.get(participantId);
    if (player === undefined) {
      throw new ParseError(
        `Game ${gameId} has no identity for participant ${participantId}.`,
      );
    }

    const puuid = typeof player.puuid === "string" ? player.puuid : "";
    if (puuid.length === 0) {
      throw new ParseError(
        `Game ${gameId} participant ${participantId} has no PUUID.`,
      );
    }

    const side = SIDE_BY_TEAM_ID[Number(participant.teamId)];
    if (side === undefined) {
      throw new ParseError(
        `Game ${gameId} participant ${participantId} has unknown teamId ` +
          `${String(participant.teamId)}.`,
      );
    }

    const stats = asRecord(participant.stats) ?? {};
    const timeline = asRecord(participant.timeline) ?? {};

    const gameName = typeof player.gameName === "string" ? player.gameName : "";
    const tagLine = typeof player.tagLine === "string" ? player.tagLine : "";

    return {
      puuid,
      gameName,
      tagLine,
      riotId: tagLine.length > 0 ? `${gameName}#${tagLine}` : gameName,
      side,
      championId: count(participant.championId),
      kills: count(stats.kills),
      deaths: count(stats.deaths),
      assists: count(stats.assists),
      // Lane minions and jungle camps are counted separately; CS is both.
      cs: count(stats.totalMinionsKilled) + count(stats.neutralMinionsKilled),
      gold: count(stats.goldEarned),
      damage: count(stats.totalDamageDealtToChampions),
      clientLane: optionalText(timeline.lane),
      clientRole: optionalText(timeline.role),
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
