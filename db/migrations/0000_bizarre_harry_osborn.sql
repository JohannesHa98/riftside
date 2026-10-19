CREATE TYPE "public"."comfort" AS ENUM('good', 'ok', 'bad');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('top', 'jungle', 'mid', 'adc', 'support');--> statement-breakpoint
CREATE TYPE "public"."team" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team" "team" NOT NULL,
	"role" "role",
	"power_at_time" integer NOT NULL,
	CONSTRAINT "match_players_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"winner" "team",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"power" integer NOT NULL,
	"top_comfort" "comfort" DEFAULT 'ok' NOT NULL,
	"jungle_comfort" "comfort" DEFAULT 'ok' NOT NULL,
	"mid_comfort" "comfort" DEFAULT 'ok' NOT NULL,
	"adc_comfort" "comfort" DEFAULT 'ok' NOT NULL,
	"support_comfort" "comfort" DEFAULT 'ok' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_name_unique" UNIQUE("name"),
	CONSTRAINT "players_power_range" CHECK ("players"."power" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;