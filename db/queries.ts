import { and, asc, count, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";

import { windowStart } from "@/lib/login-throttle";
import { assignRoles, roleOrder } from "@/lib/roles";
import { type Role, type Team } from "@/lib/types";

import { db } from "./index";
import { loginAttempts, matchBans, matchPlayers, matches, players } from "./schema";

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

  /**
   * The client's guess at where someone played. Used to order a line-up and
   * nothing else — it is derived from movement and in custom games it can
   * report three junglers and no top.
   */
  clientLane: string | null;
  clientRole: string | null;
  /** The role quest reward item the game handed out. */
  roleQuestItem: number | null;
  /** Worked out from the above. Null only if there was nothing to go on. */
  position: Role | null;

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

/**
 * Put a side in role order: top, jungle, mid, bot, support.
 *
 * `assignRoles` decides what each of them played; see `lib/roles.ts` for how,
 * and why the client's own lane is not used.
 */
function orderLineup(side: MatchParticipant[]): MatchParticipant[] {
  const roles = assignRoles(side);
  side.forEach((participant, index) => {
    participant.position = roles[index];
  });

  return [...side].sort(
    (a, b) =>
      roleOrder(a.position) - roleOrder(b.position) || a.name.localeCompare(b.name),
  );
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
      clientLane: matchPlayers.clientLane,
      clientRole: matchPlayers.clientRole,
      roleQuestItem: matchPlayers.roleQuestItem,
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
      clientLane: row.clientLane,
      clientRole: row.clientRole,
      roleQuestItem: row.roleQuestItem,
      position: null,
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
    summary.blue = orderLineup(summary.blue);
    summary.red = orderLineup(summary.red);
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

/** Games saved without a result, which no win rate can count. */
export async function countMatchesWithoutWinner(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(matches)
    .where(isNull(matches.winner));

  return row?.total ?? 0;
}

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

interface StatRow {
  id: number;
  matchId: number;
  name: string;
  riotId: string | null;
  team: Team;
  championId: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  damage: number | null;
  cs: number | null;
  playedAt: Date;
  winner: Team | null;
  durationSeconds: number | null;
  /** What they played, worked out by `lib/roles.ts`. */
  role: Role | null;
}

/**
 * Every participant of every game with what the role rule needs, linked to
 * one of our players or not: a role only falls out of a whole side at once.
 */
function roleClues() {
  return db
    .select({
      id: matchPlayers.id,
      matchId: matchPlayers.matchId,
      team: matchPlayers.team,
      roleQuestItem: matchPlayers.roleQuestItem,
      cs: matchPlayers.cs,
    })
    .from(matchPlayers);
}

interface RoleClueRow {
  id: number;
  matchId: number;
  team: Team;
  roleQuestItem: number | null;
  cs: number | null;
}

/** The role each participant played, by participant row id. */
function rolesByParticipant(rows: RoleClueRow[]): Map<number, Role | null> {
  const sides = new Map<string, RoleClueRow[]>();
  for (const row of rows) {
    const key = `${row.matchId}:${row.team}`;
    const side = sides.get(key);
    if (side === undefined) sides.set(key, [row]);
    else side.push(row);
  }

  const roles = new Map<number, Role | null>();
  for (const side of sides.values()) {
    assignRoles(side).forEach((role, index) => roles.set(side[index].id, role));
  }

  return roles;
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

/**
 * Plain data, no functions: these cross from the server to the client
 * component that draws them, and a function would not survive the trip.
 * Formatting lives with the chart.
 */
export interface SpotlightAxis {
  key: string;
  label: string;
}

/**
 * The radar's axes. Six is about the limit before the shape stops reading;
 * each is something a player visibly does in a game.
 */
export const SPOTLIGHT_AXES: SpotlightAxis[] = [
  { key: "kills", label: "Kills" },
  { key: "assists", label: "Assists" },
  { key: "survival", label: "Survival" },
  { key: "farming", label: "Farming" },
  { key: "damage", label: "Damage" },
  { key: "winRate", label: "Win rate" },
];

const FARMING_AXIS = SPOTLIGHT_AXES.findIndex((axis) => axis.key === "farming");

/**
 * What someone who mostly supports gets in place of farming. A support's CS
 * is not a measure of anything; vision is what they are actually playing for,
 * so the slot shows that instead.
 */
const VISION_AXIS: SpotlightAxis = { key: "vision", label: "Vision" };

export interface GameHighlight {
  kills: number;
  deaths: number;
  assists: number;
  championId: number | null;
}

/**
 * How good a single game was.
 *
 * Kills count in full, assists half, and every death takes one back. Ranking
 * on kills alone made a 20/5/10 tie with a 20/0/12 and keep whichever came
 * first, which is plainly wrong. A KDA ratio goes too far the other way — it
 * puts a quiet 5/0/5 above a 20/5/10 — and ranking on kills+assists with
 * deaths as a tiebreak crowns a 30/15/5 fiesta. This one orders all of those
 * the way you would say them out loud.
 */
export function gameScore(game: GameHighlight): number {
  return game.kills + game.assists / 2 - game.deaths;
}

export interface PlayerProfile {
  playerId: number;
  name: string;
  riotId: string | null;
  power: number;
  /** Ladder position, or null when they have too few games to rank. */
  rank: number | null;
  games: number;
  decided: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kda: number | null;
  champions: ChampionTally[];
  /** Their best and worst game, scored by `gameScore` below. */
  best: GameHighlight | null;
  worst: GameHighlight | null;
  /**
   * Share of their team's kills they took part in, averaged over their
   * games. Null when none of their games carry stats.
   */
  killParticipation: number | null;
  /**
   * The axes this player's shape is drawn on - `SPOTLIGHT_AXES`, except that
   * someone who supports more often than not has farming replaced by vision.
   */
  axes: SpotlightAxis[];
  /** Raw value per axis, in `axes` order. */
  raw: number[];
  /** The same values on 0-1, scaled against everyone else. */
  radar: number[];
}

export interface Spotlight {
  players: PlayerProfile[];
  /** The group's shape, for the player to be read against. */
  average: number[];
}

/**
 * Per-player profiles for the spotlight, with each axis scaled against the
 * rest of the group so a shape means "compared to us" rather than compared to
 * some absolute nobody here would recognise.
 */
export async function spotlight(): Promise<Spotlight> {
  const [rows, ladder, sides] = await Promise.all([
    db
      .select({
        id: matchPlayers.id,
        playerId: matchPlayers.playerId,
        matchId: matchPlayers.matchId,
        name: players.name,
        riotId: players.riotId,
        power: players.power,
        team: matchPlayers.team,
        winner: matches.winner,
        durationSeconds: matches.durationSeconds,
        championId: matchPlayers.championId,
        kills: matchPlayers.kills,
        deaths: matchPlayers.deaths,
        assists: matchPlayers.assists,
        cs: matchPlayers.cs,
        damage: matchPlayers.damage,
        visionScore: matchPlayers.visionScore,
      })
      .from(matchPlayers)
      .innerJoin(players, eq(players.id, matchPlayers.playerId))
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId)),
    playerStats(),
    // Every participant, linked or not, so a team's kills are not
    // undercounted by someone who is not on the roster - and so a role can be
    // worked out, which takes a whole side at once.
    db
      .select({
        id: matchPlayers.id,
        matchId: matchPlayers.matchId,
        team: matchPlayers.team,
        kills: matchPlayers.kills,
        roleQuestItem: matchPlayers.roleQuestItem,
        cs: matchPlayers.cs,
      })
      .from(matchPlayers),
  ]);

  const roles = rolesByParticipant(sides);

  const teamKills = new Map<string, number>();
  for (const row of sides) {
    const key = `${row.matchId}:${row.team}`;
    teamKills.set(key, (teamKills.get(key) ?? 0) + (row.kills ?? 0));
  }

  const rankByPlayer = new Map<number, number>();
  let position = 0;
  for (const entry of ladder) {
    if (isRanked(entry)) rankByPlayer.set(entry.playerId, ++position);
  }

  interface Running {
    profile: PlayerProfile;
    minutes: number;
    cs: number;
    /** Minutes played off support: the only ones CS is counted over. */
    farmMinutes: number;
    vision: number;
    visionMinutes: number;
    supportGames: number;
    damage: number;
    tracked: number;
    /** Summed per game, so one lopsided game cannot dominate the average. */
    shareTotal: number;
    shareGames: number;
    champions: Map<number, number>;
  }

  const running = new Map<number, Running>();

  for (const row of rows) {
    if (row.playerId === null) continue;

    let entry = running.get(row.playerId);
    if (entry === undefined) {
      entry = {
        profile: {
          playerId: row.playerId,
          name: row.name,
          riotId: row.riotId,
          power: row.power,
          rank: rankByPlayer.get(row.playerId) ?? null,
          games: 0,
          decided: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          kda: null,
          champions: [],
          best: null,
          worst: null,
          killParticipation: null,
          axes: SPOTLIGHT_AXES,
          raw: [],
          radar: [],
        },
        minutes: 0,
        cs: 0,
        farmMinutes: 0,
        vision: 0,
        visionMinutes: 0,
        supportGames: 0,
        damage: 0,
        tracked: 0,
        shareTotal: 0,
        shareGames: 0,
        champions: new Map(),
      };
      running.set(row.playerId, entry);
    }

    const p = entry.profile;
    p.games += 1;
    if (row.winner !== null) {
      p.decided += 1;
      if (row.winner === row.team) p.wins += 1;
    }

    if (row.kills !== null) {
      entry.tracked += 1;
      p.kills += row.kills;
      p.deaths += row.deaths ?? 0;
      p.assists += row.assists ?? 0;
      entry.damage += row.damage ?? 0;

      const minutes = (row.durationSeconds ?? 0) / 60;
      entry.minutes += minutes;

      // CS is only counted off support. A support is not farming, so those
      // games would drag the number down without saying anything about it.
      if (roles.get(row.id) === "support") {
        entry.supportGames += 1;
      } else {
        entry.cs += row.cs ?? 0;
        entry.farmMinutes += minutes;
      }

      if (row.visionScore !== null) {
        entry.vision += row.visionScore;
        entry.visionMinutes += minutes;
      }

      const game: GameHighlight = {
        kills: row.kills,
        deaths: row.deaths ?? 0,
        assists: row.assists ?? 0,
        championId: row.championId,
      };

      if (p.best === null || gameScore(game) > gameScore(p.best)) p.best = game;
      if (p.worst === null || gameScore(game) < gameScore(p.worst)) p.worst = game;

      const sideKills = teamKills.get(`${row.matchId}:${row.team}`) ?? 0;
      if (sideKills > 0) {
        entry.shareTotal += (row.kills + (row.assists ?? 0)) / sideKills;
        entry.shareGames += 1;
      }
    }

    if (row.championId !== null && row.championId > 0) {
      entry.champions.set(
        row.championId,
        (entry.champions.get(row.championId) ?? 0) + 1,
      );
    }
  }

  const profiles = [...running.values()].map(({ profile, ...totals }) => {
    const per = (total: number) => (totals.tracked === 0 ? 0 : total / totals.tracked);
    const perMinute = (total: number) =>
      totals.minutes === 0 ? 0 : total / totals.minutes;

    profile.killParticipation =
      totals.shareGames === 0 ? null : totals.shareTotal / totals.shareGames;

    profile.kda =
      totals.tracked === 0
        ? null
        : (profile.kills + profile.assists) / Math.max(profile.deaths, 1);

    profile.champions = [...totals.champions]
      .map(([championId, games]) => ({ championId, games }))
      .sort((a, b) => b.games - a.games || a.championId - b.championId);

    // More games on support than off it, and vision to show for them: the
    // farming slot becomes a vision slot, for this player alone.
    const supports =
      totals.supportGames * 2 > totals.tracked && totals.visionMinutes > 0;

    if (supports) {
      profile.axes = SPOTLIGHT_AXES.map((axis, index) =>
        index === FARMING_AXIS ? VISION_AXIS : axis,
      );
    }

    const rate = (total: number, minutes: number) =>
      minutes === 0 ? 0 : total / minutes;

    profile.raw = [
      per(profile.kills),
      per(profile.assists),
      per(profile.deaths),
      supports
        ? rate(totals.vision, totals.visionMinutes)
        : rate(totals.cs, totals.farmMinutes),
      perMinute(totals.damage),
      profile.decided === 0 ? 0 : profile.wins / profile.decided,
    ];

    return { profile, tracked: totals.tracked };
  });

  // Scale against players with enough games, so one stray result cannot
  // stretch an axis and flatten everyone else against it.
  const scalers = profiles.filter((entry) => entry.tracked >= MIN_RANKED_GAMES);
  const basis = scalers.length > 0 ? scalers : profiles;

  // Ranges are kept per axis *key*, not merely per slot, so the supports
  // sharing the vision slot are scaled against each other's vision and never
  // against the laners' CS sitting in the same corner of the chart.
  const ranges = SPOTLIGHT_AXES.map((_, axis) => {
    const byKey = new Map<string, { low: number; high: number }>();

    for (const entry of basis) {
      const key = entry.profile.axes[axis].key;
      const value = entry.profile.raw[axis];
      const range = byKey.get(key);

      byKey.set(
        key,
        range === undefined
          ? { low: value, high: value }
          : {
              low: Math.min(range.low, value),
              high: Math.max(range.high, value),
            },
      );
    }

    return byKey;
  });

  const scale = (profile: PlayerProfile, axis: number): number => {
    const key = profile.axes[axis].key;
    const range = ranges[axis].get(key);
    // Nobody with enough games shares this measure, so there is nothing to be
    // read against: sit the point on the middle ring rather than invent a
    // position for it.
    if (range === undefined || range.high === range.low) return 0.5;

    const scaled = (profile.raw[axis] - range.low) / (range.high - range.low);
    // Deaths read the other way round: fewer is better.
    const oriented = key === "survival" ? 1 - scaled : scaled;
    return Math.min(1, Math.max(0, oriented));
  };

  for (const { profile } of profiles) {
    profile.radar = profile.axes.map((_, axis) => scale(profile, axis));
  }

  const average = SPOTLIGHT_AXES.map((_, axis) => {
    const values = basis.map((entry) => scale(entry.profile, axis));
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });

  return {
    players: profiles
      .map((entry) => entry.profile)
      .sort(
        (a, b) =>
          (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      ),
    average,
  };
}

/**
 * How many times this address has guessed wrong inside the window.
 *
 * Old rows are dropped on the way past rather than by a scheduled job: the
 * table only ever holds the last few minutes of failures, so there is nothing
 * to tidy up later.
 */
export async function countRecentLoginFailures(addressKey: string): Promise<number> {
  const since = windowStart();

  const [row] = await db
    .select({ failures: count() })
    .from(loginAttempts)
    .where(
      and(eq(loginAttempts.addressKey, addressKey), gte(loginAttempts.attemptedAt, since)),
    );

  return row?.failures ?? 0;
}

export async function recordLoginFailure(addressKey: string): Promise<void> {
  await db.insert(loginAttempts).values({ addressKey });
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, windowStart()));
}

/** Signing in clears the slate, so one good password undoes the lockout. */
export async function clearLoginFailures(addressKey: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.addressKey, addressKey));
}
