CREATE TABLE "match_bans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "match_bans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_id" integer NOT NULL,
	"team" "team" NOT NULL,
	"champion_id" integer NOT NULL,
	"pick_turn" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_bans" ADD CONSTRAINT "match_bans_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_bans_match_turn_unique" ON "match_bans" USING btree ("match_id","pick_turn");