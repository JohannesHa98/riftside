/** The odds and ends below the ladder — records, leaders, champions, lengths. */

import { eq } from "drizzle-orm";

import { db } from "../index";
import { matchBans, matchPlayers, matches, players } from "../schema";

import { MIN_RANKED_GAMES } from "./ladder";
import { type ChampionTally, roleClues, rolesByParticipant, type StatRow } from "./shared";

export interface PlayerAverage {
  name: string;
  riotId: string | null;
  value: number;
  games: number;
}

export interface SingleGameRecord {
  name: string;
  riotId: string | null;
  value: number;
  championId: number | null;
  matchId: number;
}

export interface FunStats {
  mostBanned: ChampionTally[];
  mostPlayed: ChampionTally[];
  /** Per-game leaders, among players with enough games to mean anything. */
  leaders: {
    kills: PlayerAverage[];
    deaths: PlayerAverage[];
    assists: PlayerAverage[];
    csPerMinute: PlayerAverage[];
  };
  records: {
    kills: SingleGameRecord | null;
    deaths: SingleGameRecord | null;
    assists: SingleGameRecord | null;
    damage: SingleGameRecord | null;
    cs: SingleGameRecord | null;
  };
  sides: { blue: number; red: number };
  longestGameSeconds: number | null;
  averageGameSeconds: number | null;
  shortestGameSeconds: number | null;
}

/** How many names each leaderboard shows. */
const LEADERBOARD_SIZE = 5;

/**
 * The odds and ends below the ladder. One pass over the tracked games,
 * computed in memory like the rest: the whole table is a few hundred rows.
 */
export async function funStats(): Promise<FunStats> {
  const [bans, tracked, played, everyone] = await Promise.all([
    db.select({ championId: matchBans.championId }).from(matchBans),
    db
      .select({
        id: matchPlayers.id,
        matchId: matchPlayers.matchId,
        name: players.name,
        riotId: players.riotId,
        team: matchPlayers.team,
        championId: matchPlayers.championId,
        kills: matchPlayers.kills,
        deaths: matchPlayers.deaths,
        assists: matchPlayers.assists,
        damage: matchPlayers.damage,
        cs: matchPlayers.cs,
        playedAt: matches.playedAt,
        winner: matches.winner,
        durationSeconds: matches.durationSeconds,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(players.id, matchPlayers.playerId))
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId)),
    db
      .select({
        winner: matches.winner,
        durationSeconds: matches.durationSeconds,
      })
      .from(matches),
    roleClues(),
  ]);

  const roles = rolesByParticipant(everyone);
  const rows: StatRow[] = tracked.map((row) => ({
    ...row,
    role: roles.get(row.id) ?? null,
  }));

  // Riot records -1 for a turn where nobody banned.
  const banCounts = tally(
    bans.map((ban) => ban.championId).filter((id) => id > 0),
  );
  const playCounts = tally(
    rows
      .map((row) => row.championId)
      .filter((id): id is number => id !== null && id > 0),
  );

  const durations = played
    .map((match) => match.durationSeconds)
    .filter((seconds): seconds is number => seconds !== null && seconds > 0);

  return {
    mostBanned: banCounts.slice(0, LEADERBOARD_SIZE),
    mostPlayed: playCounts.slice(0, LEADERBOARD_SIZE),
    leaders: {
      kills: perGameLeaders(rows, (row) => row.kills),
      deaths: perGameLeaders(rows, (row) => row.deaths),
      assists: perGameLeaders(rows, (row) => row.assists),
      csPerMinute: csPerMinuteLeaders(rows),
    },
    records: {
      kills: bestBy(rows, (row) => row.kills),
      deaths: bestBy(rows, (row) => row.deaths),
      assists: bestBy(rows, (row) => row.assists),
      damage: bestBy(rows, (row) => row.damage),
      cs: bestBy(rows, (row) => row.cs),
    },
    sides: {
      blue: played.filter((match) => match.winner === "blue").length,
      red: played.filter((match) => match.winner === "red").length,
    },
    longestGameSeconds: durations.length === 0 ? null : Math.max(...durations),
    averageGameSeconds:
      durations.length === 0
        ? null
        : Math.round(
            durations.reduce((total, seconds) => total + seconds, 0) /
              durations.length,
          ),
    shortestGameSeconds: durations.length === 0 ? null : Math.min(...durations),
  };
}

function tally(ids: number[]): ChampionTally[] {
  const counts = new Map<number, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  return [...counts]
    .map(([championId, games]) => ({ championId, games }))
    .sort((a, b) => b.games - a.games || a.championId - b.championId);
}

/** Average per game, highest first, for anyone past the game minimum. */
function perGameLeaders(
  rows: StatRow[],
  pick: (row: StatRow) => number | null,
): PlayerAverage[] {
  const totals = new Map<
    string,
    { riotId: string | null; total: number; games: number }
  >();

  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;

    const entry = totals.get(row.name) ?? {
      riotId: row.riotId,
      total: 0,
      games: 0,
    };
    entry.total += value;
    entry.games += 1;
    totals.set(row.name, entry);
  }

  return [...totals]
    .filter(([, entry]) => entry.games >= MIN_RANKED_GAMES)
    .map(([name, entry]) => ({
      name,
      riotId: entry.riotId,
      value: entry.total / entry.games,
      games: entry.games,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, LEADERBOARD_SIZE);
}

/**
 * Total CS over total minutes, rather than averaging each game's rate: a
 * short game should not count as much as a long one.
 *
 * Games played on support are left out entirely. A support finishes on a
 * fraction of a laner's CS by design, so counting those games would say
 * nothing about farming and would quietly punish whoever filled support.
 */
function csPerMinuteLeaders(rows: StatRow[]): PlayerAverage[] {
  const totals = new Map<
    string,
    { riotId: string | null; cs: number; seconds: number; games: number }
  >();

  for (const row of rows) {
    if (row.cs === null || row.durationSeconds === null || row.durationSeconds <= 0) {
      continue;
    }
    if (row.role === "support") continue;

    const entry = totals.get(row.name) ?? {
      riotId: row.riotId,
      cs: 0,
      seconds: 0,
      games: 0,
    };
    entry.cs += row.cs;
    entry.seconds += row.durationSeconds;
    entry.games += 1;
    totals.set(row.name, entry);
  }

  return [...totals]
    .filter(([, entry]) => entry.games >= MIN_RANKED_GAMES)
    .map(([name, entry]) => ({
      name,
      riotId: entry.riotId,
      value: entry.cs / (entry.seconds / 60),
      games: entry.games,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, LEADERBOARD_SIZE);
}

function bestBy(
  rows: StatRow[],
  pick: (row: StatRow) => number | null,
): SingleGameRecord | null {
  let best: SingleGameRecord | null = null;

  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    if (best !== null && value <= best.value) continue;

    best = {
      name: row.name,
      riotId: row.riotId,
      value,
      championId: row.championId,
      matchId: row.matchId,
    };
  }

  return best;
}
