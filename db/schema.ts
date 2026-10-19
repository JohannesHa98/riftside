import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { COMFORTS, MAX_POWER, MIN_POWER, ROLES, TEAMS } from "@/lib/types";

export const roleEnum = pgEnum("role", ROLES);
export const comfortEnum = pgEnum("comfort", COMFORTS);
export const teamEnum = pgEnum("team", TEAMS);

export const players = pgTable(
  "players",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull().unique(),

    /**
     * Universal power level, 1-10. This is the ONLY input to team strength.
     * Role comfort never contributes to it.
     */
    power: integer().notNull(),

    /**
     * Role comfort. Feeds role assignment only, never team strength.
     */
    topComfort: comfortEnum("top_comfort").notNull().default("ok"),
    jungleComfort: comfortEnum("jungle_comfort").notNull().default("ok"),
    midComfort: comfortEnum("mid_comfort").notNull().default("ok"),
    adcComfort: comfortEnum("adc_comfort").notNull().default("ok"),
    supportComfort: comfortEnum("support_comfort").notNull().default("ok"),

    /** Retired players stay in the table so past matches keep their rosters. */
    archived: boolean().notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "players_power_range",
      sql`${table.power} between ${sql.raw(String(MIN_POWER))} and ${sql.raw(String(MAX_POWER))}`,
    ),
  ],
);

export const matches = pgTable("matches", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  playedAt: timestamp("played_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Null while a game is recorded but undecided. */
  winner: teamEnum(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const matchPlayers = pgTable(
  "match_players",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "restrict" }),
    team: teamEnum().notNull(),
    /** Suggested role. Nullable: the teams may settle roles themselves. */
    role: roleEnum(),
    /**
     * Power snapshot at the time of the match, so later Elo-style adjustments
     * have real history to replay instead of today's numbers.
     */
    powerAtTime: integer("power_at_time").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.playerId] })],
);

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchPlayer = typeof matchPlayers.$inferSelect;
export type NewMatchPlayer = typeof matchPlayers.$inferInsert;
