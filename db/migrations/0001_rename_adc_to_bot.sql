-- Rename the bot lane from "adc" to "bot" everywhere.
-- Renaming the enum value relabels every existing row in place, so no data moves.
ALTER TYPE "public"."role" RENAME VALUE 'adc' TO 'bot';--> statement-breakpoint
ALTER TABLE "players" RENAME COLUMN "adc_comfort" TO "bot_comfort";
