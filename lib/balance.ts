/**
 * Team balancer.
 *
 * Pure module: no database, no React, no I/O. Everything here is a function of
 * its arguments so it can be unit tested in isolation.
 *
 * Two systems live side by side and never touch each other:
 *
 *   1. Team strength  - the sum of the players' universal power levels.
 *                       Roles and comfort never change it.
 *   2. Role fit       - how happy players are with their assigned roles.
 *                       Comfort never contributes to strength.
 *
 * The search space is tiny (126 ways to split 10 players into two fives, and
 * 120 role orderings per team), so everything is brute forced. No heuristics.
 */

import { ROLES, type Comfort, type Role } from "./types";

export const TEAM_SIZE = 5;
export const PLAYERS_PER_GAME = TEAM_SIZE * 2;

/**
 * Power difference, in power points, within which two splits count as equally
 * balanced. Raise it to let role fit outweigh small strength gaps; drop it to
 * 0 to make strength the hard priority. Tunable on purpose.
 */
export const POWER_TOLERANCE = 1;

/** How many suggestions the UI offers to choose between. */
export const SUGGESTION_COUNT = 3;

export interface BalancePlayer {
  id: number;
  name: string;
  /** Universal power level, 1-10. The only input to team strength. */
  power: number;
  /** Comfort per role. Only ever used for role assignment. */
  comfort: Record<Role, Comfort>;
}

export interface RoleAssignment {
  player: BalancePlayer;
  role: Role;
  /** The player's comfort on the role they were given. */
  comfort: Comfort;
}

export interface BalancedTeam {
  /** One per role, ordered top, jungle, mid, adc, support. */
  assignments: RoleAssignment[];
  totalPower: number;
  goodCount: number;
  badCount: number;
}

/** The parts of a split that decide how it ranks. */
export interface SplitScore {
  powerDifference: number;
  /** Players on a role they are good at, across both teams. */
  goodCount: number;
  /** Players forced onto a role they are bad at, across both teams. */
  badCount: number;
}

export interface Suggestion extends SplitScore {
  blue: BalancedTeam;
  red: BalancedTeam;
}

/** Every ordering of the five roles: 120 of them. */
const ROLE_PERMUTATIONS: Role[][] = permutations(ROLES);

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];

  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) {
      result.push([items[i], ...tail]);
    }
  }
  return result;
}

/** Index combinations: every way to choose `k` of `0..n-1`. */
function indexCombinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const current: number[] = [];

  function walk(start: number) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    // Stop early once too few indices are left to finish the combination.
    for (let i = start; i <= n - (k - current.length); i++) {
      current.push(i);
      walk(i + 1);
      current.pop();
    }
  }

  walk(0);
  return result;
}

/**
 * Best role assignment for one team of five: fewest players on a `bad` role
 * first, then the most players on a `good` role.
 */
export function bestRoleAssignment(team: readonly BalancePlayer[]): BalancedTeam {
  if (team.length !== TEAM_SIZE) {
    throw new Error(`A team needs exactly ${TEAM_SIZE} players, got ${team.length}.`);
  }

  let bestRoles: Role[] = [];
  let bestGood = -1;
  let bestBad = Number.POSITIVE_INFINITY;

  for (const roles of ROLE_PERMUTATIONS) {
    let good = 0;
    let bad = 0;

    for (let i = 0; i < TEAM_SIZE; i++) {
      const comfort = team[i].comfort[roles[i]];
      if (comfort === "good") good++;
      else if (comfort === "bad") bad++;
    }

    if (bad < bestBad || (bad === bestBad && good > bestGood)) {
      bestRoles = roles;
      bestGood = good;
      bestBad = bad;
    }
  }

  const assignments: RoleAssignment[] = team.map((player, i) => ({
    player,
    role: bestRoles[i],
    comfort: player.comfort[bestRoles[i]],
  }));
  assignments.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));

  return {
    assignments,
    totalPower: team.reduce((sum, player) => sum + player.power, 0),
    goodCount: bestGood,
    badCount: bestBad,
  };
}

/**
 * Every unique way to split the players into two teams of five, each scored.
 *
 * The first player is pinned to blue, which is what keeps this at 126 splits
 * instead of 252 mirror-image duplicates.
 */
export function enumerateSplits(players: readonly BalancePlayer[]): Suggestion[] {
  assertValidRoster(players);

  const [pinned, ...rest] = players;

  return indexCombinations(rest.length, TEAM_SIZE - 1).map((blueIndices) => {
    const inBlue = new Set(blueIndices);
    const blue = bestRoleAssignment([pinned, ...blueIndices.map((i) => rest[i])]);
    const red = bestRoleAssignment(rest.filter((_, i) => !inBlue.has(i)));

    return {
      blue,
      red,
      powerDifference: Math.abs(blue.totalPower - red.totalPower),
      goodCount: blue.goodCount + red.goodCount,
      badCount: blue.badCount + red.badCount,
    };
  });
}

/**
 * Rank scored splits, best first.
 *
 *   1. Drop any split that forces someone onto a `bad` role, unless every
 *      split does, in which case keep those with the fewest.
 *   2. Of those, find the smallest power difference and treat everything
 *      within `tolerance` of it as equally balanced.
 *   3. Among those equals, prefer the most players on `good` roles, then the
 *      smallest power difference.
 *
 * Splits outside the tolerance band follow, ordered by power difference, so
 * callers asking for more suggestions than the band holds still get sensible
 * runners-up.
 */
export function rankSplits<T extends SplitScore>(
  splits: readonly T[],
  tolerance: number = POWER_TOLERANCE,
): T[] {
  if (splits.length === 0) return [];

  const fewestBad = Math.min(...splits.map((split) => split.badCount));
  const viable = splits.filter((split) => split.badCount === fewestBad);

  const smallestDifference = Math.min(...viable.map((split) => split.powerDifference));
  const cutoff = smallestDifference + tolerance;

  const equallyBalanced = viable.filter((split) => split.powerDifference <= cutoff);
  const runnersUp = viable.filter((split) => split.powerDifference > cutoff);

  equallyBalanced.sort(
    (a, b) => b.goodCount - a.goodCount || a.powerDifference - b.powerDifference,
  );
  runnersUp.sort(
    (a, b) => a.powerDifference - b.powerDifference || b.goodCount - a.goodCount,
  );

  return [...equallyBalanced, ...runnersUp];
}

export interface BalanceOptions {
  tolerance?: number;
  limit?: number;
}

/** Top suggestions for a roster of exactly ten players, best first. */
export function balanceTeams(
  players: readonly BalancePlayer[],
  { tolerance = POWER_TOLERANCE, limit = SUGGESTION_COUNT }: BalanceOptions = {},
): Suggestion[] {
  return rankSplits(enumerateSplits(players), tolerance).slice(0, limit);
}

function assertValidRoster(players: readonly BalancePlayer[]): void {
  if (players.length !== PLAYERS_PER_GAME) {
    throw new Error(
      `Need exactly ${PLAYERS_PER_GAME} players, got ${players.length}.`,
    );
  }

  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length) {
    throw new Error("The same player was selected more than once.");
  }
}
