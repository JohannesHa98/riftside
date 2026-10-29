import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { COMFORTS, MAX_POWER, MIN_POWER, ROLES, TEAMS } from "@/lib/types";

export const roleEnum = pgEnum("role", ROLES);
export const comfortEnum = pgEnum("comfort", COMFORTS);
export const teamEnum = pgEnum("team", TEAMS);

/** Where a match came from: saved by hand, or picked up by the companion app. */
export const matchSourceEnum = pgEnum("match_source", ["manual", "riot"]);

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
    botComfort: comfortEnum("bot_comfort").notNull().default("ok"),
    supportComfort: comfortEnum("support_comfort").notNull().default("ok"),

    /**
     * Riot identity, filled in so the companion app can match a League
     * participant to this player. PUUID is the reliable key; the Riot ID is
     * a fallback, because people rename themselves.
     */
    riotId: text("riot_id").unique(),
    puuid: text().unique(),

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

  /**
   * Riot's game id, once the companion app has matched this match to a real
   * game. Unique, which is what makes ingest idempotent. bigint because the
   * ids are already past what int4 holds.
   */
  riotGameId: bigint("riot_game_id", { mode: "number" }).unique(),
  durationSeconds: integer("duration_seconds"),
  source: matchSourceEnum().notNull().default("manual"),

  /**
   * The League client's whole response for this game, exactly as it arrived.
   *
   * The columns above are what the app reads; this is the archive. The client
   * only keeps about twenty games of history, so a stat not captured at
   * ingest time is gone for good — keeping the original means a question we
   * think of later is a query rather than a regret. Roughly 30 KB a game.
   */
  rawPayload: jsonb("raw_payload"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const matchPlayers = pgTable(
  "match_players",
  {
    /**
     * A surrogate key, because a participant the companion app could not
     * match to anyone on the roster has no player_id to form a pair with.
     */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),

    /** Null for a League participant who is not one of our players yet. */
    playerId: integer("player_id").references(() => players.id, {
      onDelete: "restrict",
    }),

    team: teamEnum().notNull(),

    /** The balancer's suggestion. Never overwritten with what was played. */
    role: roleEnum(),

    /**
     * Power snapshot at the time of the match, so later Elo-style adjustments
     * have real history to replay instead of today's numbers. Null for an
     * unlinked participant, who has no power to snapshot.
     */
    powerAtTime: integer("power_at_time"),

    /**
     * Riot identity of this participant, kept even when linked so an unlinked
     * row can be connected to a player later.
     */
    puuid: text(),
    riotId: text("riot_id"),

    /** Per-game stats from the League client. Null on hand-saved matches. */
    championId: integer("champion_id"),
    kills: integer(),
    deaths: integer(),
    assists: integer(),
    cs: integer(),
    gold: integer(),
    damage: integer(),

    /**
     * The game's own vision score. Stored because CS says nothing about a
     * support: it is what the spotlight shows instead of farming for someone
     * who mostly supports.
     */
    visionScore: integer("vision_score"),

    /**
     * What the client guessed someone played. Not a role: it is derived from
     * movement and is wrong often enough in customs that it is recorded and
     * not relied on.
     */
    clientLane: text("client_lane"),
    clientRole: text("client_role"),

    /**
     * The role quest reward item, which the game hands out by lane: 1221 and
     * 1220 top, 1209 jungle, 1206 mid, 1208 support. Unlike the lane guess
     * above this is a fact about what the game decided someone was playing,
     * so it is what line-ups are ordered by.
     */
    roleQuestItem: integer("role_quest_item"),
  },
  (table) => [
    // Replaces the old composite primary key. Partial, so many unlinked
    // participants can sit in one match while a real player still cannot be
    // listed in the same match twice.
    uniqueIndex("match_players_match_player_unique")
      .on(table.matchId, table.playerId)
      .where(sql`${table.playerId} is not null`),
    uniqueIndex("match_players_match_puuid_unique")
      .on(table.matchId, table.puuid)
      .where(sql`${table.puuid} is not null`),
  ],
);

/**
 * Champions banned in a game. Kept as rows rather than a column so they can
 * be counted and joined; pick_turn preserves the order they went in.
 */
export const matchBans = pgTable(
  "match_bans",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    team: teamEnum().notNull(),
    /** Riot uses -1 for a turn where nobody banned. */
    championId: integer("champion_id").notNull(),
    pickTurn: integer("pick_turn").notNull(),
  },
  (table) => [
    uniqueIndex("match_bans_match_turn_unique").on(table.matchId, table.pickTurn),
  ],
);

/**
 * Failed sign-in attempts, so an address can be shut out after too many.
 *
 * It lives in the database rather than in memory because the site runs in
 * serverless functions: an in-memory counter resets on a cold start and
 * disagrees between instances, which makes it no limit at all. Successes are
 * not recorded — signing in clears the address's rows — so the table stays
 * near-empty and holds nothing about anyone who gets their password right.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),

    /** sha256 of the address salted with AUTH_SECRET, never the address. */
    addressKey: text("address_key").notNull(),

    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Every read is "this address, since this time".
    index("login_attempts_address_time").on(table.addressKey, table.attemptedAt),
  ],
);

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type MatchPlayer = typeof matchPlayers.$inferSelect;
export type NewMatchPlayer = typeof matchPlayers.$inferInsert;
export type MatchBan = typeof matchBans.$inferSelect;
export type NewMatchBan = typeof matchBans.$inferInsert;
