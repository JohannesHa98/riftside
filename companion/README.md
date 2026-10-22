# In-house companion

Runs on a Windows PC while the League client is open, notices when an in-house
custom game finishes, and sends it to the website.

Read-only: it never sends a command to the client or automates anything.

## Setup

```
cd companion
npm install
copy .env.example .env     # then fill in INGEST_SECRET
npm start
```

Leave it running. Start the League client whenever.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Watch for finished games and send them |
| `npm run backfill` | Send every in-house game in recent history that has not been sent |
| `npm run probe` | Dump what the client returns to `fixtures/raw/` and exit |

## What counts as an in-house game

A custom game, on Summoner's Rift, in CLASSIC mode, with ten players. All four
checks are needed: a real match history also holds ARAM customs and practice
tool runs, which are custom games too.

## Sending twice

Nothing is remembered locally. A backfill offers every in-house game in recent
history and the website answers "created" or "duplicate" — it is the only
thing that knows what it has.

That means deleting a game on the website and running a backfill brings it
back, which a local list would have silently prevented. `riot_game_id` is
UNIQUE in the database, so even two companions sending the same game at the
same instant cannot produce two rows.

## Matching players

Participants are matched to players by PUUID, falling back to Riot ID. Fill in
each player's Riot ID on the website's Players page first, or every game will
arrive with ten unlinked participants.
