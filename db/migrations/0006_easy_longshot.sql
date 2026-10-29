ALTER TABLE "match_players" ADD COLUMN "vision_score" integer;--> statement-breakpoint
-- Every game's whole client response is archived, so the games already
-- recorded can have their vision scores filled in rather than lost. Matched
-- on PUUID, and only where the column is still empty, so re-running is safe.
UPDATE "match_players" mp
SET "vision_score" = archived.vision_score
FROM (
  SELECT
    m."id" AS match_id,
    ident->'player'->>'puuid' AS puuid,
    (participant->'stats'->>'visionScore')::int AS vision_score
  FROM "matches" m
  CROSS JOIN LATERAL jsonb_array_elements(m."raw_payload"->'participants') AS participant
  CROSS JOIN LATERAL jsonb_array_elements(m."raw_payload"->'participantIdentities') AS ident
  WHERE jsonb_typeof(m."raw_payload"->'participants') = 'array'
    AND jsonb_typeof(m."raw_payload"->'participantIdentities') = 'array'
    AND participant->>'participantId' = ident->>'participantId'
) AS archived
WHERE mp."match_id" = archived.match_id
  AND mp."puuid" = archived.puuid
  AND mp."vision_score" IS NULL;
