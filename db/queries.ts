import { asc, eq } from "drizzle-orm";

import { db } from "./index";
import { players } from "./schema";

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
