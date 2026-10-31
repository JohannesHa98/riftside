/** What two players have done to each other, and alongside each other. */

import { eq } from "drizzle-orm";

import { db } from "../index";
import { matchPlayers, matches } from "../schema";

export interface PairRecord {
  /** Games on opposite sides, and how many the *first* of the pair won. */
  against: { games: number; wins: number };
  /** Games on the same side, and how many of those they won. */
  together: { games: number; wins: number };
}

/**
 * Every pair that has shared a game, keyed `lowerId:higherId`.
 *
 * The key is ordered so a pair has one entry rather than two that can drift
 * apart, and `against.wins` is always counted for the lower id — the reader
 * flips it when showing the other way round. `pairKey` below is the only
 * place that ordering is decided.
 */
export type PairRecords = Record<string, PairRecord>;

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** True when `wins` in a record is counted for this player. */
export function countsFor(player: number, other: number): boolean {
  return player < other;
}

function blank(): PairRecord {
  return { against: { games: 0, wins: 0 }, together: { games: 0, wins: 0 } };
}

/**
 * One pass over every participant, pairing up each game's roster.
 *
 * A game of ten contributes 45 pairs, so this stays linear in games rather
 * than growing with the roster: a season of in-houses is a few thousand
 * tallies, which is nothing, and the result is small enough to hand to the
 * browser whole — the comparison panel then switches opponent without a
 * round trip, like the rest of the spotlight.
 *
 * Only games with a recorded winner count. A record of "3-0" that quietly
 * included two unfinished games would be worse than no record at all.
 */
export async function pairRecords(): Promise<PairRecords> {
  const rows = await db
    .select({
      matchId: matchPlayers.matchId,
      playerId: matchPlayers.playerId,
      team: matchPlayers.team,
      winner: matches.winner,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId));

  const rosters = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.playerId === null || row.winner === null) continue;
    const roster = rosters.get(row.matchId);
    if (roster === undefined) rosters.set(row.matchId, [row]);
    else roster.push(row);
  }

  const records: PairRecords = {};

  for (const roster of rosters.values()) {
    for (let i = 0; i < roster.length; i += 1) {
      for (let j = i + 1; j < roster.length; j += 1) {
        const one = roster[i];
        const other = roster[j];
        const key = pairKey(one.playerId!, other.playerId!);
        const record = (records[key] ??= blank());

        // Whose win it counts as is decided once, by the key's ordering.
        const lower = one.playerId! < other.playerId! ? one : other;

        if (one.team === other.team) {
          record.together.games += 1;
          if (one.winner === one.team) record.together.wins += 1;
        } else {
          record.against.games += 1;
          if (lower.winner === lower.team) record.against.wins += 1;
        }
      }
    }
  }

  return records;
}
