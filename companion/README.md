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

`npm run probe` connects, dumps what the client returns to `fixtures/raw/`, and
exits without watching for games.
