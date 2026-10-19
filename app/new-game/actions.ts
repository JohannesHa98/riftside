"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, matchPlayers, matches, players } from "@/db";
import { PLAYERS_PER_GAME, TEAM_SIZE } from "@/lib/balance";
import { ROLES, TEAMS, type Role, type Team } from "@/lib/types";

export interface MatchSlot {
  playerId: number;
  /** Null when the teams sorted roles out themselves. */
  role: Role | null;
}

export interface SaveMatchInput {
  blue: MatchSlot[];
  red: MatchSlot[];
  winner: Team | null;
}

function assertValid(input: SaveMatchInput): void {
  if (input.blue.length !== TEAM_SIZE || input.red.length !== TEAM_SIZE) {
    throw new Error(`Each team needs exactly ${TEAM_SIZE} players.`);
  }

  if (input.winner !== null && !(TEAMS as readonly string[]).includes(input.winner)) {
    throw new Error("Unknown winner.");
  }

  const slots = [...input.blue, ...input.red];
  if (new Set(slots.map((slot) => slot.playerId)).size !== PLAYERS_PER_GAME) {
    throw new Error("The same player appears twice.");
  }

  for (const slot of slots) {
    if (slot.role !== null && !(ROLES as readonly string[]).includes(slot.role)) {
      throw new Error("Unknown role.");
    }
  }
}

/**
 * Save a played game. Power levels are read from the database rather than
 * taken from the client, so the snapshot in match_players is trustworthy.
 */
export async function saveMatch(input: SaveMatchInput): Promise<void> {
  assertValid(input);

  const slots = [
    ...input.blue.map((slot) => ({ ...slot, team: "blue" as const })),
    ...input.red.map((slot) => ({ ...slot, team: "red" as const })),
  ];

  const ids = slots.map((slot) => slot.playerId);
  const known = await db
    .select({ id: players.id, power: players.power })
    .from(players)
    .where(inArray(players.id, ids));

  if (known.length !== PLAYERS_PER_GAME) {
    throw new Error("Some of those players no longer exist.");
  }

  const powerById = new Map(known.map((player) => [player.id, player.power]));

  const [match] = await db
    .insert(matches)
    .values({ winner: input.winner })
    .returning({ id: matches.id });

  try {
    await db.insert(matchPlayers).values(
      slots.map((slot) => ({
        matchId: match.id,
        playerId: slot.playerId,
        team: slot.team,
        role: slot.role,
        powerAtTime: powerById.get(slot.playerId)!,
      })),
    );
  } catch (error) {
    // The driver has no interactive transactions, so undo the half-written
    // match rather than leaving an empty one behind.
    await db.delete(matches).where(inArray(matches.id, [match.id]));
    throw error;
  }

  revalidatePath("/history");
  redirect("/history");
}
