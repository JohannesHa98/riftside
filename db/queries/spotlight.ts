/** One player, drawn against the group. */

import { eq } from "drizzle-orm";

import { db } from "../index";
import { matchPlayers, matches, players } from "../schema";

import { MIN_RANKED_GAMES, isRanked, playerStats } from "./ladder";
import { rolesByParticipant } from "./shared";

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

/**
 * A champion someone plays, with how it has gone. `decided` is games with a
 * winner recorded, which is what a win rate can honestly be taken over.
 */
export interface ChampionRecord {
  championId: number;
  games: number;
  wins: number;
  decided: number;
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
  champions: ChampionRecord[];
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
/**
 * How one player's number on an axis reads against the group's.
 *
 * Ranges are kept per axis *key*, not merely per slot: someone who mostly
 * supports spends the fourth slot on vision rather than farming, so that slot
 * holds two different measures at once. Scaling by slot alone would read a
 * support's two vision per minute against a laner's seven CS per minute and
 * put them at the bottom of a chart they are not even on.
 *
 * Returns a function rather than a table because every caller wants the same
 * question answered — where does this sit — and nobody wants the ranges.
 */
function scaleAgainst(
  basis: PlayerProfile[],
): (profile: PlayerProfile, axis: number) => number {
  const ranges = SPOTLIGHT_AXES.map((_, axis) => {
    const byKey = new Map<string, { low: number; high: number }>();

    for (const profile of basis) {
      const key = profile.axes[axis].key;
      const value = profile.raw[axis];
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

  return (profile, axis) => {
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
}

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
    champions: Map<number, { games: number; wins: number; decided: number }>;
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
      const champion = entry.champions.get(row.championId) ?? {
        games: 0,
        wins: 0,
        decided: 0,
      };
      champion.games += 1;
      if (row.winner !== null) {
        champion.decided += 1;
        if (row.winner === row.team) champion.wins += 1;
      }
      entry.champions.set(row.championId, champion);
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
      .map(([championId, record]) => ({ championId, ...record }))
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

  const scale = scaleAgainst(basis.map((entry) => entry.profile));

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
