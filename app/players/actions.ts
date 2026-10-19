"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, matchPlayers, players } from "@/db";
import { COMFORTS, MAX_POWER, MIN_POWER, ROLES, type Comfort } from "@/lib/types";

export type PlayerFormState = { ok: true; at: number } | { error: string } | null;

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

function parseComfort(value: FormDataEntryValue | null): Comfort {
  const comfort = String(value ?? "ok");
  return (COMFORTS as readonly string[]).includes(comfort)
    ? (comfort as Comfort)
    : "ok";
}

interface ParsedPlayer {
  name: string;
  power: number;
  topComfort: Comfort;
  jungleComfort: Comfort;
  midComfort: Comfort;
  adcComfort: Comfort;
  supportComfort: Comfort;
  archived: boolean;
}

function parsePlayerForm(
  formData: FormData,
): { values: ParsedPlayer } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: "Give the player a name." };
  if (name.length > 40) return { error: "That name is a bit long." };

  const power = Number(formData.get("power"));
  if (!Number.isInteger(power) || power < MIN_POWER || power > MAX_POWER) {
    return { error: `Power has to be a whole number from ${MIN_POWER} to ${MAX_POWER}.` };
  }

  const [top, jungle, mid, adc, support] = ROLES.map((role) =>
    parseComfort(formData.get(role)),
  );

  return {
    values: {
      name,
      power,
      topComfort: top,
      jungleComfort: jungle,
      midComfort: mid,
      adcComfort: adc,
      supportComfort: support,
      archived: formData.get("archived") === "on",
    },
  };
}

export async function createPlayer(
  _previous: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const parsed = parsePlayerForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await db.insert(players).values(parsed.values);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: `There is already a player called ${parsed.values.name}.` };
    }
    throw error;
  }

  revalidatePath("/players");
  revalidatePath("/new-game");
  return { ok: true, at: Date.now() };
}

export async function updatePlayer(
  id: number,
  _previous: PlayerFormState,
  formData: FormData,
): Promise<PlayerFormState> {
  const parsed = parsePlayerForm(formData);
  if ("error" in parsed) return parsed;

  try {
    await db.update(players).set(parsed.values).where(eq(players.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: `There is already a player called ${parsed.values.name}.` };
    }
    throw error;
  }

  revalidatePath("/players");
  revalidatePath("/new-game");
  return { ok: true, at: Date.now() };
}

/**
 * Remove a player. Someone who has already played is retired instead of
 * deleted, so past matches keep their full rosters.
 */
export async function deletePlayer(id: number): Promise<void> {
  const [{ played }] = await db
    .select({ played: count() })
    .from(matchPlayers)
    .where(eq(matchPlayers.playerId, id));

  if (played > 0) {
    await db.update(players).set({ archived: true }).where(eq(players.id, id));
  } else {
    await db.delete(players).where(eq(players.id, id));
  }

  revalidatePath("/players");
  revalidatePath("/new-game");
}

export async function restorePlayer(id: number): Promise<void> {
  await db.update(players).set({ archived: false }).where(eq(players.id, id));

  revalidatePath("/players");
  revalidatePath("/new-game");
}
