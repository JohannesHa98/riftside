# CLAUDE.md

## What this is

A private website for organising 5v5 in-house League of Legends games with a
fixed group of friends. The core feature is a **team balancer**: pick the 10
players who are playing tonight, and the app splits them into two even teams and
suggests a role for each player. Suggested roles are a starting point only — the
teams settle roles among themselves.

There is **no login**. It is a small trusted group, so every page is open.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (via `@tailwindcss/turbopack`)
- **Neon Postgres** through `@neondatabase/serverless`
- **Drizzle ORM** + **drizzle-kit** migrations
- **Vitest** for unit tests
- Hosted on **Vercel**; pushing to `master` deploys automatically
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

## Environment

`.env.local` (git-ignored, pulled from the Vercel/Neon integration) holds many
variables. **Only two are used:**

- `DATABASE_URL` — pooled, used by the app at runtime
- `DATABASE_URL_UNPOOLED` — direct, used by drizzle-kit for migrations

Ignore every other `POSTGRES_*`, `PG*` and `NEON_AUTH_*` variable. Neon Auth is
not set up and should not be.

## Data model

**Player** — name, one universal `power` level (1–10, how good they are
overall), and a comfort level per role (`top`, `jungle`, `mid`, `adc`,
`support`) of `good` | `ok` | `bad`.

**Match** — date, the two teams, the suggested role per player (optional, since
the teams may change them), and which team won.

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

A consequence worth keeping: a team cannot end up with three adc players,
because they cannot all get good roles.

The UI shows the **top 3 suggestions** so one can be chosen, or rerolled.

## Pages

1. **Players** — list, add, edit, delete players with power level and per-role comfort
2. **New game** — pick 10 players, run the balancer, show both teams side by side with total power, suggested roles, and each player's comfort on that role
3. **Record result** — save a played game (teams, optional roles, winner)
4. **History** — past games

## Planned later (do not build yet, but do not design it out)

- Elo-style automatic power adjustment from wins and losses
- Player stats: win rate, games played

## Conventions

- Server Components by default; Server Actions for mutations. No extra state
  library unless something genuinely needs one.
- Keep the balancer pure and framework-free so it stays testable.
- Database access goes through Drizzle in `db/`; no raw SQL in components.
- Schema changes go through `db:generate` + `db:migrate` so the SQL is tracked
  in the repo. **Never** use `drizzle-kit push`.
- Design: clean, simple **dark** theme that suits a gaming site, mobile-first.
- Build in small steps. `npm run build` must pass before each commit.
- Commit after each working step with a clear message. **Ask before pushing.**

## Note on AGENTS.md

`AGENTS.md` is generated and re-added by `next dev`. Leave its contents alone;
commit it along with other work to keep the tree clean.
