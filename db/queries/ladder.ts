/** The ladder: who is above whom, and why. */

import { eq } from "drizzle-orm";

import { db } from "../index";
import { matchPlayers, matches, players } from "../schema";

import { type ChampionTally } from "./shared";

export interface PlayerStats {
  playerId: number;
  name: string;
  power: number;
  archived: boolean;
  /** For the link out to their dpm.lol profile; null if not set. */
  riotId: string | null;
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
      riotId: players.riotId,
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
        riotId: row.riotId,
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
  //
  // Win rate, then who held it over more games, then KDA. Two players on the
  // same record over the same number of games are genuinely level on the
  // thing the ladder measures, so the tiebreak asks how they got there rather
  // than falling back on the alphabet.
  const byMerit = (a: PlayerStats, b: PlayerStats) =>
    (kdaRatio(b) ?? 0) - (kdaRatio(a) ?? 0) || a.name.localeCompare(b.name);

  return [...byPlayer.values()].sort((a, b) => {
    const rankedA = isRanked(a);
    const rankedB = isRanked(b);

    if (rankedA !== rankedB) return rankedA ? -1 : 1;

    if (!rankedA) return b.decided - a.decided || byMerit(a, b);

    return (
      (winRate(b) ?? 0) - (winRate(a) ?? 0) ||
      b.decided - a.decided ||
      byMerit(a, b)
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
