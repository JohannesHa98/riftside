/** Past games, and the line-ups that played them. */

import { count, desc, eq, inArray, isNull } from "drizzle-orm";

import { assignRoles, roleOrder } from "@/lib/roles";
import { type Role, type Team } from "@/lib/types";

import { db } from "../index";
import { matchPlayers, matches, players } from "../schema";

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

/** Games saved without a result, which no win rate can count. */
export async function countMatchesWithoutWinner(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(matches)
    .where(isNull(matches.winner));

  return row?.total ?? 0;
}
