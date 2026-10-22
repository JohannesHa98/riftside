CREATE TYPE "public"."match_source" AS ENUM('manual', 'riot');--> statement-breakpoint
ALTER TABLE "match_players" DROP CONSTRAINT "match_players_match_id_player_id_pk";--> statement-breakpoint
ALTER TABLE "match_players" ALTER COLUMN "player_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ALTER COLUMN "power_at_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "id" integer PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "match_players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "puuid" text;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "riot_id" text;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "champion_id" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "kills" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "deaths" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "assists" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "cs" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "gold" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "damage" integer;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "client_lane" text;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "client_role" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "riot_game_id" bigint;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "source" "match_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "riot_id" text;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "puuid" text;--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_player_unique" ON "match_players" USING btree ("match_id","player_id") WHERE "match_players"."player_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "match_players_match_puuid_unique" ON "match_players" USING btree ("match_id","puuid") WHERE "match_players"."puuid" is not null;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_riot_game_id_unique" UNIQUE("riot_game_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_riot_id_unique" UNIQUE("riot_id");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_puuid_unique" UNIQUE("puuid");