# CLAUDE.md

## What this is

**Riftside** — a private website for organising 5v5 in-house League of Legends
games with a fixed group of friends. The name is the job: it decides which
side of the Rift each player ends up on, which is the vocabulary the UI
already uses (Blue side, Red side). The core feature is a **team balancer**: pick the 10
players who are playing tonight, and the app splits them into two even teams and
suggests a role for each player. Suggested roles are a starting point only — the
teams settle roles among themselves.

Reading is open to anyone. **Editing needs a login** — see `## Auth`.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (via `@tailwindcss/turbopack`)
- **Neon Postgres** through `@neondatabase/serverless`
- **Drizzle ORM** + **drizzle-kit** migrations
- **Vitest** for unit tests
- Hosted on **Vercel** at `riftside.vercel.app`; pushing to `master` deploys automatically
- Package manager: **npm**

### Next.js 16 specifics

This is not the Next.js in your training data. Read the bundled docs in
`node_modules/next/dist/docs/` before writing framework code.

`next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`.
That changes how data loading works:

- An uncached async read (every database read here) **must** sit inside a
  `<Suspense>` boundary, or the route fails to prerender.
- `"use cache"` is for data that may be stale. This app's data is small and
  always changing, so prefer **uncached reads + Suspense**, and
  `revalidatePath()` after mutations.
- Do not reach for the old `fetch`-cache / `export const dynamic` patterns.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build — must pass after every step |
| `npm run lint` | ESLint |
| `npm test` | Vitest (run once) |
| `npm run db:generate` | Generate a SQL migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run auth:new` | Generate a strong password and its hash |
| `npm run auth:hash` | Hash a password you already have |

Inside `companion/`:

| Command | What it does |
| --- | --- |
| `npm start` | Watch the League client and send finished in-house games |
| `npm run backfill` | Send any in-house game in recent history not sent yet |
| `npm run probe` | Dump what the client returns to `fixtures/raw/` and exit |

## Auth

One account: whoever knows the password behind `ADMIN_PASSWORD_HASH`. **Reading
is public** — anyone can browse the roster, run the balancer and read history.
**Every write requires a session.**

- `lib/password.ts` — scrypt hashing, no Next.js imports so
  `scripts/hash-password.mjs` can load it directly and the two cannot drift.
  The hash uses `.` as its separator, **not `$`**: Next.js runs `.env` values
  through dotenv-expand, which eats `$`.
- `lib/auth.ts` — signs a JWT into an HttpOnly, SameSite=Lax cookie.
  `isSignedIn()` never throws; `requireSignedIn()` throws.
- **Every mutating server action calls one of those guards.** Server actions are
  reachable by direct POST, so hiding a button protects nothing. Adding a new
  action means adding a guard — `lib/auth.test.ts` covers forged, expired and
  `alg: none` tokens, but it cannot catch an unguarded action.
- Rotating `AUTH_SECRET` invalidates every existing session. It also salts the
  hashed addresses in `login_attempts`, so rotating it clears every lockout.
- **Failed sign-ins are counted in Postgres** (`login_attempts`, and
  `lib/login-throttle.ts` for the policy). Not in memory: serverless instances
  do not share one, and a cold start would reset it. `MAX_ATTEMPTS` failures
  inside `ATTEMPT_WINDOW_MINUTES` locks an address out; a successful sign-in
  deletes its rows, and old rows are dropped on the next failure rather than
  by a scheduled job. Only the salted hash of an address is stored.
- **The whole site is `noindex`** (`app/layout.tsx`). The pages carry real
  names and Riot IDs, and everyone who needs the link has it. Done with a
  meta tag, not a disallow-all robots.txt: a crawler told not to fetch a
  page never reads the tag on it and can still list the bare URL.
- **Nothing links to `/login`.** There is one account, so a sign-in link would
  only advertise the way in. Go to `/login` directly. Signed out, the nav shows
  no auth control at all; signed in, it shows Sign out. The page is `noindex`.
  Do not add a sign-in link back without asking.

## Security headers

`next.config.ts` sets a Content-Security-Policy and the usual companions on
every response. Two things follow from it:

- **Anything loaded from a new host has to be named there.** A font from
  Google, an image CDN, an analytics script — the browser will block it
  silently and the page will simply look wrong. `img-src` already names
  Community Dragon for the champion portraits.
- **Scripts and styles allow `unsafe-inline`**, because Next inlines its own
  bootstrap and the theme script runs before React to stop a white flash. A
  nonce would close that, but a nonce is per request, which makes every page
  dynamic and costs the partial prerendering the site is built on. Nothing
  here renders user-supplied HTML, so React's escaping is what carries that
  risk.

`frame-ancestors 'none'` is the one with teeth: a session lasts thirty days
and every delete is one click behind it, which is what clickjacking is for.
Vercel adds HSTS on top.

## Environment

`.env.local` (git-ignored, pulled from the Vercel/Neon integration) holds many
variables. **Only two are used:**

- `DATABASE_URL` — pooled, used by the app at runtime
- `DATABASE_URL_UNPOOLED` — direct, used by drizzle-kit for migrations
- `AUTH_SECRET` — signs the session cookie, 32+ random characters
- `ADMIN_PASSWORD_HASH` — from `npm run auth:hash`
- `INGEST_SECRET` — shared with the companion app, which sends it as
  `x-ingest-secret`

`companion/.env` holds `WEBSITE_URL`, the same `INGEST_SECRET`, and optionally
`LOCKFILE_PATH`.

`.env.example` lists all five. See `## Auth` below.

Ignore every other `POSTGRES_*`, `PG*` and `NEON_AUTH_*` variable. Neon Auth is
not set up and should not be.

## Data model

**Player** — name, one universal `power` level (1–10, how good they are
overall), and a comfort level per role (`top`, `jungle`, `mid`, `bot`,
`support`) of `good` | `ok` | `bad`.

Those three are the stored values and the names used throughout the code. The
UI shows them as **Main / Fill / Never**, the words League players already use.
`COMFORT_LABELS` in `lib/types.ts` is the only place that mapping lives, so the
wording can change without a migration.

**Match** — date, the two teams and which team won. **Every match comes from
the companion app**; there is no way to record one by hand, because a
hand-entered game has none of the stats the site is built on. Once the companion app has
matched it to a real game it also carries `riot_game_id` (unique, which is what
makes ingest idempotent), the duration, and per player: champion, K/D/A, CS,
gold and damage.

`match_players.player_id` is **nullable**: a League participant who is not on
the roster is still stored, with their Riot identity, and shown as unlinked.
That is why the table has a surrogate `id` and a partial unique index rather
than a composite primary key. `power_at_time` is nullable for the same reason.

**Roles come from `role_quest_item`**, the reward the game hands out by lane:
1221 and 1220 top, 1209 jungle, 1206 mid, 1208 support. That is the game
saying which role it assigned. The two it does not name are the bot lane and
whoever sold their support reward, and CS separates those. The rule lives in
`lib/roles.ts` (`assignRoles`) and takes a whole side at once, so anything
needing it has to load every participant of a game, linked or not.

**CS never counts a game played on support.** A support finishes on a fraction
of a laner's CS by design, so including those games would say nothing about
farming and would punish whoever filled. This applies to the Best farmer card
and to the spotlight's farming axis. For the same reason the spotlight shows
**vision instead of farming** to anyone with more support games than other
games — `vision_score` is stored per participant for exactly that.

`client_lane` / `client_role` are the client's own guess and are **not** used
for this. They are derived from movement and a real in-house game of ours came
back with three junglers and no top.

`match_players.role` held the balancer's suggestion back when games could be
saved by hand. Nothing writes it now.

## Two systems that must stay separate

This is the most important rule in the project. Do not let these leak into each
other.

1. **Team strength** — the sum of the players' universal power levels. Roles
   never change it.
2. **Role fit** — how happy players are with their assigned roles. Comfort never
   contributes to strength.

So: comfort never affects strength, and strength never decides roles.

## Balancing algorithm

Lives in its own **pure TypeScript module** with no database or React imports,
covered by Vitest unit tests.

Input is exactly 10 players. There are only 126 unique ways to split 10 players
into two teams of 5, and 120 role assignments per team, so **brute force
everything** — no heuristics.

For each team, find its best role assignment: first minimise players on `bad`
roles, then maximise players on `good` roles.

Then choose the split:

1. Discard any split that forces someone onto a `bad` role, as long as at least
   one split exists without that. If none exists, keep the splits with the
   fewest `bad` roles.
2. Among those, find the smallest power difference. Treat every split within a
   small tolerance of it (a tunable constant, starting at **1** power point) as
   equally balanced.
3. Among those, prefer the most players on `good` roles. Final tiebreaker is the
   smallest power difference.

A consequence worth keeping: a team cannot end up with three bot players,
because they cannot all get good roles.

The UI shows the **top 3 suggestions** so one can be chosen, or rerolled.

## Pages

Ordered as they appear in the nav — New game first, since that is what the
site gets opened for.

1. **New game** — pick 10 players, run the balancer, show both teams side by side with total power, suggested roles, and each player's comfort on that role. Nothing is saved here: the companion records the game once it has been played.
2. **Players** — list, add, edit, delete players with power level and per-role comfort
3. **History** — past games, and deleting one
4. **Stats** — the ladder, odds and ends, and a per-player spotlight with a
   radar, which becomes a head to head when a second player is chosen
   (`?against=`): their record against each other, their record as
   teammates, both shapes on one chart and the stats facing each other.
   An axis the two are not measured on the same way — farming against
   vision — is left out rather than compared. Every name on this page puts
   that player in the spotlight rather
   than leaving the site: the selection lives in `?player=<name>`, which is how a
   name rendered on the server in its own Suspense boundary reaches the
   spotlight's client state. The one name that still links to dpm.lol is the
   spotlight's own heading, where selecting would do nothing.

## Planned later (do not build yet, but do not design it out)

- Elo-style automatic power adjustment from wins and losses
- Linking an unlinked participant to a player from the History page

## Layout

```
app/
  new-game/    pick ten, balance, save  (actions.ts, team-picker.tsx)
  players/     list, add, edit, delete  (actions.ts, player-form.tsx)
  history/     past games, set winner   (actions.ts, winner-buttons.tsx)
  stats/       per-player totals
  login/       the one account
  api/ingest/  receives games from the companion app
components/    shared UI (nav, cards, badges, primitives)
db/            schema, client, migrations, and queries/ — a file per
               subject (players, matches, ladder, fun-stats, spotlight,
               login-attempts). db/queries.ts re-exports all of them, so
               pages import from "@/db/queries" and never from inside
lib/           types, balance, auth, ingest rules, champion names
companion/     the Windows companion app (its own package)
```

The balancer runs in the browser, not on the server: it is pure and the
whole search is 126 splits, so it costs less than a round trip and lets
the selection re-rank instantly. Server components hand the client only
the four fields it needs.

## Companion app (`companion/`)

A separate Node package that runs on a player's Windows PC while the League
client is open, notices finished in-house games and posts them to
`/api/ingest`. Riot's public API does not include custom games; the client's
own local API (the LCU) does.

**Read-only.** It never sends a command to the client or automates anything
in-game, and nothing should ever make it do so.

- No build step: Node runs the TypeScript by stripping types, so imports carry
  `.ts` extensions and `erasableSyntaxOnly` is on. The only runtime dependency
  is `ws`. The root `tsconfig.json` excludes this folder; it has its own.
- **`src/parse.ts` holds every assumption about the client's data**, with no
  imports and no I/O. The LCU API is undocumented and unversioned, so when Riot
  changes something this should be the only file to touch.
- **Do not trust remembered field names.** `npm run probe` dumps real responses
  to `fixtures/raw/` and prints their shape; build parsing from that. Three
  that are not what you would guess: `teams[].win` is the string `"Win"`/
  `"Fail"`, CS is `totalMinionsKilled` **plus** `neutralMinionsKilled`, and
  `participantIdentities` joins on `participantId`, not list position.
- An in-house game is `CUSTOM_GAME` + `CLASSIC` + map 11 + ten players. All
  four matter: a real history also holds ARAM customs (mode `KIWI`, map 12)
  and practice tool runs, which are custom games too. The ten-player check
  needs the game *detail* — the history list only carries the current summoner.
- **The website is the only record of what has been sent.** The companion
  keeps no local list: one would disagree with reality the moment a game is
  deleted on the site, and re-sending is free because ingest is idempotent.
  Watch mode tracks the newest game id in memory only, so it looks forward
  without persisting anything.
- Tests run from the repo root, against committed fixtures that are real
  responses with identities swapped for fakes (`scripts/make-fixture.mjs`).
  `fixtures/raw/` and `.env` stay out of git.

### Ingest

`POST /api/ingest`, guarded by `INGEST_SECRET` in an `x-ingest-secret` header,
compared in constant time. The secret lives on someone else's PC, so it means
"this came from our companion", not "this is true" — `lib/ingest.ts` validates
the body like any untrusted input, and the route can only write a game.

Participants match on PUUID first, Riot ID second, never two to the same
player; a Riot ID match backfills the PUUID so the name-based guess is needed
only once.

Ingest is idempotent on `riot_game_id`, which is UNIQUE in the database. The
route checks for an existing game first, but that check races: two companions
can both pass it. The unique constraint is the actual guarantee, and the
violation is caught and reported as a duplicate rather than a failure.

Ingest only ever creates a match. It used to merge into a game saved by hand
on the New game page, but saving by hand is gone — the whole point is that
every game carries the client's stats, and a hand-entered one carries none.

### Champion names

`lib/champions.ts` is the one place `"use cache"` is right rather than the
uncached-plus-Suspense rule above: it is external reference data from Community
Dragon, identical for everyone, changing a few times a year. It falls back to
showing ids if the fetch fails, because a cosmetic lookup should never produce
an error page.

## Conventions

- Server Components by default; Server Actions for mutations. No extra state
  library unless something genuinely needs one.
- Keep the balancer pure and framework-free so it stays testable.
- Database access goes through Drizzle in `db/`; no raw SQL in components.
- Schema changes go through `db:generate` + `db:migrate` so the SQL is tracked
  in the repo. **Never** use `drizzle-kit push`.
- Design: clean, simple **dark** theme that suits a gaming site, mobile-first.
  Light mode is opt-in via Splurrp mode in the header, which stamps
  `data-theme="light"` on `<html>`. Only the colour tokens in `globals.css`
  change, so new UI inherits both themes by using the tokens (`bg-panel`,
  `text-ink-dim`, …) rather than hard-coded colours.
- **Documentation is part of the change, not a follow-up.** A change that makes
  `README.md`, `CLAUDE.md` or `companion/README.md` wrong is not finished until
  they are right. The README is read by people deciding whether the project is
  worth their time, so an out-of-date one costs more than a missing one.
- Build in small steps. `npm run build` must pass before each commit.
- Commit after each working step with a clear message. **Ask before pushing.**

## Verifying changes

Match the check to the risk. This is a small project; over-verifying costs
real time and context for no benefit.

**Always, before committing:** `npm run build`, `npm run lint`, `npm test`.
They are fast and catch most of it.

**Open a browser only** when a change introduces new runtime behaviour that
crosses a boundary the build cannot see: hydration, a server action, a new
database write, or client state wired to one of those. A hydration mismatch is
the standing example — invisible to build, lint and tests alike.

**Do not** open a browser for CSS, copy, labels, or layout tweaks.

When a check is warranted, prefer the cheap probe — `curl | grep`, or one
JavaScript expression returning the few values in question — over screenshots,
which are the most expensive thing to put in context. Screenshot only when the
question really is "does this look right", and then once, not per state.

The exception worth keeping: the database is live, so a bad write is the one
thing that is awkward to undo. Exercise a new
database-write path once, end to end, before trusting it.

## Note on AGENTS.md

`AGENTS.md` is generated and re-added by `next dev`. Leave its contents alone;
commit it along with other work to keep the tree clean.
