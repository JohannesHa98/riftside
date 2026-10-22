import { cacheLife } from "next/cache";

/**
 * Champion id to name.
 *
 * The League client only gives us a numeric championId, so the names come
 * from Community Dragon's public game-data mirror.
 *
 * This is the one place `"use cache"` is the right call rather than the
 * uncached-plus-Suspense pattern the rest of the app uses: it is external
 * reference data, identical for everyone, and changes a handful of times a
 * year. Fetching it per request would be silly.
 */
const CHAMPION_SUMMARY_URL =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-summary.json";

export async function championNames(): Promise<Map<number, string>> {
  "use cache";
  cacheLife("weeks");

  try {
    const response = await fetch(CHAMPION_SUMMARY_URL);
    if (!response.ok) return new Map();

    const parsed: unknown = await response.json();
    if (!Array.isArray(parsed)) return new Map();

    const names = new Map<number, string>();
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, name } = entry as { id?: unknown; name?: unknown };
      // -1 is Community Dragon's "no champion" placeholder.
      if (typeof id === "number" && id > 0 && typeof name === "string") {
        names.set(id, name);
      }
    }

    return names;
  } catch {
    // Offline, or the mirror moved. Falling back to ids is better than an
    // error page over a cosmetic lookup.
    return new Map();
  }
}

export function championLabel(
  names: Map<number, string>,
  championId: number | null,
): string {
  if (championId === null || championId <= 0) return "—";
  return names.get(championId) ?? `#${championId}`;
}

/** Square portrait, served by id so no name mapping is needed. */
export function championIconUrl(championId: number | null): string | null {
  if (championId === null || championId <= 0) return null;
  return `https://cdn.communitydragon.org/latest/champion/${championId}/square`;
}
