import { asc, desc, eq, inArray } from "drizzle-orm";

import { ROLES, type Role, type Team } from "@/lib/types";

import { db } from "./index";
import { matchPlayers, matches, players } from "./schema";

/** Everyone, active players first, alphabetical within each group. */
export async function listPlayers() {
  return db
    .select()
    .from(players)
    .orderBy(asc(players.archived), asc(players.name));
}

/** Players available to pick for a game. */
export async function listActivePlayers() {
  return db
    .select()
    .from(players)
    .where(eq(players.archived, false))
    .orderBy(asc(players.name));
}

export interface MatchParticipant {
  /** Null for a League participant not yet linked to one of our players. */
  playerId: number | null;
  name: string;
  role: Role | null;
  /** Null for an unlinked participant, who has no power to snapshot. */
  powerAtTime: number | null;
}

export interface MatchSummary {
  id: number;
  playedAt: Date;
  winner: Team | null;
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
    })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .where(
      inArray(
        matchPlayers.matchId,
        rows.map((match) => match.id),
      ),
    );

  const summaries = new Map<number, MatchSummary>(
    rows.map((match) => [
      match.id,
      { id: match.id, playedAt: match.playedAt, winner: match.winner, blue: [], red: [] },
    ]),
  );

  for (const row of participants) {
    summaries.get(row.matchId)?.[row.team].push({
      playerId: row.playerId,
      name: row.name,
      role: row.role,
      powerAtTime: row.powerAtTime,
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
