"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, matches } from "@/db";
import { requireSignedIn } from "@/lib/auth";
import { TEAMS, type Team } from "@/lib/types";

/** Fill in (or correct, or clear) who won a game that was already saved. */
export async function setWinner(matchId: number, winner: Team | null): Promise<void> {
  await requireSignedIn();

  if (winner !== null && !(TEAMS as readonly string[]).includes(winner)) {
    throw new Error("Unknown winner.");
  }

  await db.update(matches).set({ winner }).where(eq(matches.id, matchId));

  revalidatePath("/history");
}

/**
 * Delete a game and its whole roster.
 *
 * match_players is ON DELETE CASCADE, so the participant rows go with it.
 * There is no undo, which is why the button asks first.
 */
export async function deleteMatch(matchId: number): Promise<void> {
  await requireSignedIn();

  await db.delete(matches).where(eq(matches.id, matchId));

  revalidatePath("/history");
  revalidatePath("/stats");
}
