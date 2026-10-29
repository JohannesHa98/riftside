import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ParseError,
  inHouseCandidates,
  isInHouseGame,
  listHistoryGames,
  parseGame,
} from "./parse.ts";

/**
 * Fixtures are real responses from a real client, with identities swapped for
 * stable fakes (see scripts/make-fixture.mjs). Shapes are untouched, so these
 * tests fail if Riot changes the payload and we have not noticed.
 */
function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", `${name}.json`), "utf8"),
  );
}

const customGame = fixture("custom-sr-game");
const aramGame = fixture("aram-game");
const history = fixture("match-history");

describe("isInHouseGame", () => {
  it("accepts a real custom game on Summoner's Rift with ten players", () => {
    expect(isInHouseGame(customGame)).toBe(true);
  });

  it("rejects a custom game on another map", () => {
    // Real ARAM-style custom: also CUSTOM_GAME, but mode KIWI on map 12.
    expect(isInHouseGame(aramGame)).toBe(false);
  });

  it("rejects a Summoner's Rift custom that is not ten players", () => {
    const short = {
      ...(customGame as Record<string, unknown>),
      participants: (customGame as { participants: unknown[] }).participants.slice(0, 9),
    };

    expect(isInHouseGame(short)).toBe(false);
  });

  it("rejects the practice tool, which is also a custom game on the Rift", () => {
    expect(
      isInHouseGame({
        ...(customGame as Record<string, unknown>),
        gameMode: "PRACTICETOOL",
      }),
    ).toBe(false);
  });

  it("rejects matchmade games", () => {
    expect(
      isInHouseGame({
        ...(customGame as Record<string, unknown>),
        gameType: "MATCHED_GAME",
      }),
    ).toBe(false);
  });

  it("rejects rubbish without throwing", () => {
    for (const value of [null, undefined, 42, "game", [], {}]) {
      expect(isInHouseGame(value)).toBe(false);
    }
  });
});

describe("listHistoryGames", () => {
  it("reads the games out of a real history response", () => {
    const games = listHistoryGames(history);

    expect(games).toHaveLength(20);
    expect(games[0].gameId).toBeGreaterThan(games[1].gameId);
  });

  it("finds only the in-house candidates among mixed game types", () => {
    const candidates = inHouseCandidates(history);

    expect(candidates.length).toBeGreaterThan(0);
    for (const game of candidates) {
      expect(game.gameType).toBe("CUSTOM_GAME");
      expect(game.gameMode).toBe("CLASSIC");
      expect(game.mapId).toBe(11);
    }

    // The real history holds ARAM customs and practice tool runs too.
    const all = listHistoryGames(history);
    expect(candidates.length).toBeLessThan(all.length);
  });

  it("returns nothing for a response of the wrong shape", () => {
    for (const value of [null, {}, { games: {} }, { games: { games: "no" } }]) {
      expect(listHistoryGames(value)).toEqual([]);
    }
  });
});

describe("parseGame", () => {
  const parsed = parseGame(customGame);

  it("reads the game itself", () => {
    expect(parsed.gameId).toBe(8020944938);
    expect(parsed.durationSeconds).toBe(1958);
    expect(parsed.playedAt).toBe("2026-10-21T21:34:37.586Z");
    expect(parsed.participants).toHaveLength(10);
  });

  it("reads the winner from the string Win/Fail, not a boolean", () => {
    // In the fixture team 100 won.
    expect(parsed.winner).toBe("blue");
  });

  it("has no winner when neither side is marked as having won", () => {
    const aborted = {
      ...(customGame as Record<string, unknown>),
      teams: [
        { teamId: 100, win: "Fail" },
        { teamId: 200, win: "Fail" },
      ],
    };

    expect(parseGame(aborted).winner).toBeNull();
  });

  it("splits the ten players five a side", () => {
    const blue = parsed.participants.filter((p) => p.side === "blue");
    const red = parsed.participants.filter((p) => p.side === "red");

    expect(blue).toHaveLength(5);
    expect(red).toHaveLength(5);
  });

  it("joins identities on participantId rather than list position", () => {
    for (const participant of parsed.participants) {
      expect(participant.puuid).not.toBe("");
      expect(participant.riotId).toContain("#");
    }

    const ids = parsed.participants.map((p) => p.puuid);
    expect(new Set(ids).size).toBe(10);
  });

  it("keeps a non-ASCII tagline intact", () => {
    const korean = parsed.participants.find((p) => p.tagLine === "테스트");

    expect(korean).toBeDefined();
    expect(korean?.riotId.endsWith("#테스트")).toBe(true);
  });

  it("counts CS as lane minions plus jungle camps", () => {
    const first = (customGame as { participants: Array<{ stats: Record<string, number> }> })
      .participants[0];
    const expected =
      first.stats.totalMinionsKilled + first.stats.neutralMinionsKilled;

    expect(parsed.participants[0].cs).toBe(expected);
    // Supports end a 32-minute game on very little CS; the sum must not be
    // silently reading one of the two fields.
    expect(Math.min(...parsed.participants.map((p) => p.cs))).toBeLessThan(60);
    expect(Math.max(...parsed.participants.map((p) => p.cs))).toBeGreaterThan(150);
  });

  it("reads the per-player stats we store", () => {
    for (const participant of parsed.participants) {
      expect(participant.championId).toBeGreaterThan(0);
      expect(participant.kills).toBeGreaterThanOrEqual(0);
      expect(participant.deaths).toBeGreaterThanOrEqual(0);
      expect(participant.assists).toBeGreaterThanOrEqual(0);
      expect(participant.gold).toBeGreaterThan(0);
      expect(participant.damage).toBeGreaterThan(0);
      expect(participant.visionScore).toBeGreaterThan(0);
    }
  });

  it("reads vision score, which is what a support is judged on", () => {
    const first = (customGame as { participants: Array<{ stats: Record<string, number> }> })
      .participants[0];

    expect(parsed.participants[0].visionScore).toBe(first.stats.visionScore);
    // The support warded several times what the top laner did; a vision score
    // that is the same for everyone means the wrong field is being read.
    const scores = parsed.participants.map((p) => p.visionScore ?? 0);
    expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores) * 2);
  });

  it("keeps the client's lane guess without treating it as a role", () => {
    // The client derives this and gets it wrong in customs — the fixture has
    // a side with two junglers and no top. Recorded, never relied on.
    const lanes = parsed.participants
      .filter((p) => p.side === "red")
      .map((p) => p.clientLane);

    expect(lanes.every((lane) => lane === null || typeof lane === "string")).toBe(true);
    expect(new Set(lanes).size).toBeLessThan(5);
  });

  it("refuses a game that is not an in-house game", () => {
    expect(() => parseGame(aramGame)).toThrow(ParseError);
    expect(() => parseGame(aramGame)).toThrow(/not an in-house game/);
  });

  it("refuses a game with a participant whose identity is missing", () => {
    const game = structuredClone(customGame) as {
      participantIdentities: unknown[];
    };
    game.participantIdentities = game.participantIdentities.slice(1);

    expect(() => parseGame(game)).toThrow(/no identity for participant/);
  });

  it("refuses a game with an unknown team id", () => {
    const game = structuredClone(customGame) as {
      participants: Array<{ teamId: number }>;
    };
    game.participants[0].teamId = 300;

    expect(() => parseGame(game)).toThrow(/unknown teamId/);
  });

  it("refuses rubbish with a readable message", () => {
    expect(() => parseGame(null)).toThrow(/not an object/);
    expect(() => parseGame({})).toThrow(/no numeric gameId/);
  });
});
