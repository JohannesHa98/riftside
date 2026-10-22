import { asc, count, desc, eq, inArray, isNull } from "drizzle-orm";

import { ROLES, type Role, type Team } from "@/lib/types";

import { db } from "./index";
import { matchPlayers, matches, players } from "./schema";

/** Everyone, active players first, strongest first within each group. */
export async function listPlayers() {
  return db
    .select()
    .from(players)
    .orderBy(asc(players.archived), desc(players.power), asc(players.name));
}

/** Players available to pick for a game, strongest first. */
export async function listActivePlayers() {
  return db
    .select()
    .from(players)
    .where(eq(players.archived, false))
    .orderBy(desc(players.power), asc(players.name));
}

export interface MatchParticipant {
  /** Null for a League participant not yet linked to one of our players. */
  playerId: number | null;
  /** The player's name, or their Riot ID when nobody is linked. */
  name: string;
  /** True when this is a League participant we could not place. */
  unlinked: boolean;
  role: Role | null;
  /** Null for an unlinked participant, who has no power to snapshot. */
  powerAtTime: number | null;

  /** From the League client. Null on a game saved by hand. */
  championId: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold: number | null;
  damage: number | null;
}

export interface MatchSummary {
  id: number;
  playedAt: Date;
  winner: Team | null;
  /** Null until the companion app has matched this to a real game. */
  durationSeconds: number | null;
  /** True once the League client's own numbers are attached. */
  fromRiot: boolean;
  blue: MatchParticipant[];
  red: MatchParticipant[];
}

/** Role order within a team, with unassigned players last. */
function byRole(a: MatchParticipant, b: MatchParticipant): number {
  const rank = (role: Role | null) => (role === null ? ROLES.length : ROLES.indexOf(role));
  return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name);
}

/** Past games, newest first, each with both rosters. */
export async function listMatches(limit = 50): Promise<MatchSummary[]> {
  const rows = await db
    .select()
    .from(matches)
    .orderBy(desc(matches.playedAt), desc(matches.id))
    .limit(limit);

  if (rows.length === 0) return [];

  const participants = await db
    .select({
      matchId: matchPlayers.matchId,
      team: matchPlayers.team,
      role: matchPlayers.role,
      powerAtTime: matchPlayers.powerAtTime,
      playerId: players.id,
      name: players.name,
      riotId: matchPlayers.riotId,
      championId: matchPlayers.championId,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      assists: matchPlayers.assists,
      cs: matchPlayers.cs,
      gold: matchPlayers.gold,
      damage: matchPlayers.damage,
    })
    .from(matchPlayers)
    // Left join, not inner: a participant the companion could not place has
    // no player row, and dropping them would quietly shrink the game to
    // fewer than ten.
    .leftJoin(players, eq(players.id, matchPlayers.playerId))
    .where(
      inArray(
        matchPlayers.matchId,
        rows.map((match) => match.id),
      ),
    );

  const summaries = new Map<number, MatchSummary>(
    rows.map((match) => [
      match.id,
      {
        id: match.id,
        playedAt: match.playedAt,
        winner: match.winner,
        durationSeconds: match.durationSeconds,
        fromRiot: match.source === "riot",
        blue: [],
        red: [],
      },
    ]),
  );

  for (const row of participants) {
    summaries.get(row.matchId)?.[row.team].push({
      playerId: row.playerId,
      name: row.name ?? row.riotId ?? "Unknown player",
      unlinked: row.playerId === null,
      role: row.role,
      powerAtTime: row.powerAtTime,
      championId: row.championId,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      cs: row.cs,
      gold: row.gold,
      damage: row.damage,
    });
  }

  for (const summary of summaries.values()) {
    summary.blue.sort(byRole);
    summary.red.sort(byRole);
  }

  return rows.map((match) => summaries.get(match.id)!);
}

/** Unlinked participants contribute nothing, having no power on record. */
export function totalPower(side: MatchParticipant[]): number {
  return side.reduce((sum, participant) => sum + (participant.powerAtTime ?? 0), 0);
}

export interface ChampionTally {
  championId: number;
  games: number;
}

export interface PlayerStats {
  playerId: number;
  name: string;
  power: number;
  archived: boolean;
  /** Every game they appear in. */
  games: number;
  /** Games with a recorded winner — the only ones a win rate can use. */
  decided: number;
  wins: number;
  /** Games carrying the League client's numbers. */
  tracked: number;
  kills: number;
  deaths: number;
  assists: number;
  champions: ChampionTally[];
}

/**
 * Per-player totals, newest-heaviest first.
 *
 * Aggregated in memory rather than in SQL: this is a group of friends, so the
 * whole table is a few hundred rows, and the alternative is a query nobody
 * will want to change later.
 */
export async function playerStats(): Promise<PlayerStats[]> {
  const rows = await db
    .select({
      playerId: matchPlayers.playerId,
      name: players.name,
      power: players.power,
      archived: players.archived,
      team: matchPlayers.team,
      winner: matches.winner,
      kills: matchPlayers.kills,
      deaths: matchPlayers.deaths,
      assists: matchPlayers.assists,
      championId: matchPlayers.championId,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId));

  const byPlayer = new Map<number, PlayerStats>();
  const championCounts = new Map<number, Map<number, number>>();

  for (const row of rows) {
    if (row.playerId === null) continue;

    let stats = byPlayer.get(row.playerId);
    if (stats === undefined) {
      stats = {
        playerId: row.playerId,
        name: row.name,
        power: row.power,
        archived: row.archived,
        games: 0,
        decided: 0,
        wins: 0,
        tracked: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        champions: [],
      };
      byPlayer.set(row.playerId, stats);
      championCounts.set(row.playerId, new Map());
    }

    stats.games += 1;
    if (row.winner !== null) {
      stats.decided += 1;
      if (row.winner === row.team) stats.wins += 1;
    }

    if (row.kills !== null) {
      stats.tracked += 1;
      stats.kills += row.kills;
      stats.deaths += row.deaths ?? 0;
      stats.assists += row.assists ?? 0;
    }

    if (row.championId !== null && row.championId > 0) {
      const counts = championCounts.get(row.playerId)!;
      counts.set(row.championId, (counts.get(row.championId) ?? 0) + 1);
    }
  }

  for (const [playerId, counts] of championCounts) {
    byPlayer.get(playerId)!.champions = [...counts]
      .map(([championId, games]) => ({ championId, games }))
      .sort((a, b) => b.games - a.games || a.championId - b.championId);
  }

  // A ladder: ranked players by win rate, then everyone still short of the
  // minimum, closest to qualifying first.
  return [...byPlayer.values()].sort((a, b) => {
    const rankedA = isRanked(a);
    const rankedB = isRanked(b);

    if (rankedA !== rankedB) return rankedA ? -1 : 1;

    if (!rankedA) {
      return b.decided - a.decided || a.name.localeCompare(b.name);
    }

    // Same rate: the one who held it over more games ranks above.
    return (
      (winRate(b) ?? 0) - (winRate(a) ?? 0) ||
      b.decided - a.decided ||
      a.name.localeCompare(b.name)
    );
  });
}

/** Kills plus assists per death, counting a death-free game as no deaths. */
export function kdaRatio(stats: PlayerStats): number | null {
  if (stats.tracked === 0) return null;
  return (stats.kills + stats.assists) / Math.max(stats.deaths, 1);
}

export function winRate(stats: PlayerStats): number | null {
  return stats.decided === 0 ? null : stats.wins / stats.decided;
}

/**
 * Games needed before a win rate means anything. One lucky game should not
 * top the ladder.
 */
export const MIN_RANKED_GAMES = 5;

export function isRanked(stats: PlayerStats): boolean {
  return stats.decided >= MIN_RANKED_GAMES;
}

/** Games saved without a result, which no win rate can count. */
export async function countMatchesWithoutWinner(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(matches)
    .where(isNull(matches.winner));

  return row?.total ?? 0;
}
