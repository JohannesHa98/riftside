/** The pieces more than one of the stats files needs: what a champion
 * tally looks like, and working out which role each participant played. */

import { assignRoles } from "@/lib/roles";
import { type Role, type Team } from "@/lib/types";

import { db } from "../index";
import { matchPlayers } from "../schema";

export interface ChampionTally {
  championId: number;
  games: number;
}

export interface StatRow {
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
export function roleClues() {
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

export interface RoleClueRow {
  id: number;
  matchId: number;
  team: Team;
  roleQuestItem: number | null;
  cs: number | null;
}

/** The role each participant played, by participant row id. */
export function rolesByParticipant(rows: RoleClueRow[]): Map<number, Role | null> {
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
