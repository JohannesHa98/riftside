import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LcuClient } from "./lcu.ts";

/**
 * The LCU API is unofficial and undocumented, so nothing here assumes a path
 * exists or that a field is named what we remember. Every candidate endpoint
 * is tried, whatever comes back is written to disk in full, and the console
 * gets a structural outline only.
 *
 * The outline is what the parsing module gets built from — not memory.
 */
export const CANDIDATE_ENDPOINTS: Array<{ slug: string; path: string; why: string }> = [
  {
    slug: "current-summoner",
    path: "/lol-summoner/v1/current-summoner",
    why: "who is logged in, and the shape of a Riot ID / PUUID",
  },
  {
    slug: "gameflow-phase",
    path: "/lol-gameflow/v1/gameflow-phase",
    why: "the value we watch for EndOfGame",
  },
  {
    slug: "gameflow-session",
    path: "/lol-gameflow/v1/session",
    why: "queue and game mode of the session in progress",
  },
  {
    slug: "match-history",
    path: "/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=19",
    why: "recent games, and whether custom games appear here",
  },
  {
    slug: "match-history-unpaged",
    path: "/lol-match-history/v1/products/lol/current-summoner/matches",
    why: "fallback if the paged form is rejected",
  },
  {
    slug: "eog-stats-block",
    path: "/lol-end-of-game/v1/eog-stats-block",
    why: "end-of-game stats, only present just after a game",
  },
  {
    slug: "region-locale",
    path: "/riotclient/region-locale",
    why: "sanity check that auth works at all",
  },
];

export interface ProbeResult {
  slug: string;
  path: string;
  status: number;
  outline: string;
  body: unknown;
}

export async function probeEndpoints(client: LcuClient): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];

  for (const candidate of CANDIDATE_ENDPOINTS) {
    try {
      const response = await client.get(candidate.path);
      results.push({
        slug: candidate.slug,
        path: candidate.path,
        status: response.status,
        outline: outline(response.body),
        body: response.body,
      });
    } catch (error) {
      results.push({
        slug: candidate.slug,
        path: candidate.path,
        status: 0,
        outline: `request failed: ${error instanceof Error ? error.message : String(error)}`,
        body: null,
      });
    }
  }

  return results;
}

export async function writeRawDumps(
  results: ProbeResult[],
  directory: string,
): Promise<string[]> {
  await mkdir(directory, { recursive: true });

  const written: string[] = [];
  for (const result of results) {
    if (result.status !== 200 || result.body === null) continue;

    const file = join(directory, `${result.slug}.json`);
    await writeFile(file, JSON.stringify(result.body, null, 2), "utf8");
    written.push(file);
  }

  return written;
}

export async function writeRawDump(
  name: string,
  body: unknown,
  directory: string,
): Promise<string> {
  await mkdir(directory, { recursive: true });

  const file = join(directory, `${name}.json`);
  await writeFile(file, JSON.stringify(body, null, 2), "utf8");
  return file;
}

/**
 * A compact map of a JSON value: key paths and types, arrays collapsed to
 * their first element. Long strings and anything that looks like an
 * identifier are shortened, so a terminal (or a transcript) does not fill up
 * with somebody's PUUID.
 */
export function outline(value: unknown, depth = 0, key = ""): string {
  const pad = "  ".repeat(depth);

  if (value === null) return `${pad}${key}null`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${key}[] (empty)`;
    return [
      `${pad}${key}[${value.length}] of:`,
      outline(value[0], depth + 1),
    ].join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}${key}{} (empty)`;

    return entries
      .map(([name, child]) => outline(child, depth + 1, `${name}: `))
      .join("\n");
  }

  return `${pad}${key}${describeScalar(value)}`;
}

const SECRET_LOOKING = /^[0-9a-zA-Z_-]{30,}$/;

function describeScalar(value: unknown): string {
  if (typeof value === "string") {
    if (SECRET_LOOKING.test(value)) return `string (${value.length} chars, hidden)`;
    if (value.length > 40) return `string "${value.slice(0, 40)}…"`;
    return `"${value}"`;
  }

  return `${value} (${typeof value})`;
}
