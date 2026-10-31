/** The roster. */

import { asc, desc, eq } from "drizzle-orm";

import { db } from "../index";
import { players } from "../schema";

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
