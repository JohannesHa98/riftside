/**
 * Riot IDs — gameName#tagLine.
 *
 * Pure and framework-free so both the form and the ingest route use the same
 * rules. Deliberately permissive about characters: a real tagLine seen in one
 * of our own games was Korean, so anything ASCII-only would have rejected a
 * real player.
 */

const MAX_GAME_NAME = 32;
const MAX_TAG_LINE = 16;

export type RiotIdResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Null means "not set" — an empty field clears it rather than failing.
 * Returns the id normalised, with surrounding whitespace removed.
 */
export function parseRiotId(input: unknown): RiotIdResult {
  const text = String(input ?? "").trim();
  if (text.length === 0) return { ok: true, value: null };

  const parts = text.split("#");
  if (parts.length !== 2) {
    return { ok: false, error: "A Riot ID looks like Name#TAG." };
  }

  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();

  if (gameName.length === 0 || tagLine.length === 0) {
    return { ok: false, error: "A Riot ID needs a name and a tag, like Name#TAG." };
  }

  if (gameName.length > MAX_GAME_NAME || tagLine.length > MAX_TAG_LINE) {
    return { ok: false, error: "That Riot ID is longer than Riot allows." };
  }

  return { ok: true, value: `${gameName}#${tagLine}` };
}

/**
 * Riot IDs are not case sensitive in practice, so comparisons fold case.
 * Used to match a League participant to a player when there is no PUUID yet.
 */
export function riotIdKey(riotId: string | null | undefined): string | null {
  const text = (riotId ?? "").trim();
  return text.length === 0 ? null : text.toLocaleLowerCase();
}

export type PuuidResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Usually filled in automatically by the companion, but editable by hand. */
export function parsePuuid(input: unknown): PuuidResult {
  const text = String(input ?? "").trim();
  if (text.length === 0) return { ok: true, value: null };

  if (!/^[A-Za-z0-9_-]{20,128}$/.test(text)) {
    return { ok: false, error: "That does not look like a PUUID." };
  }

  return { ok: true, value: text };
}

/**
 * Link to a player's dpm.lol profile, which addresses people as
 * gameName-tagLine.
 *
 * Both halves are URL-encoded: real Riot IDs in this group include spaces and
 * non-ASCII tags. The separator stays a literal dash, which is what the site
 * expects — a dash inside a game name is ambiguous, but that is dpm.lol's
 * format rather than something to work around here.
 */
export function dpmProfileUrl(riotId: string | null | undefined): string | null {
  const parsed = parseRiotId(riotId);
  if (!parsed.ok || parsed.value === null) return null;

  const [gameName, tagLine] = parsed.value.split("#");

  return `https://dpm.lol/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
}
