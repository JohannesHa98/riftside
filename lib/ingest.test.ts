import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findSuggestionMatch,
  linkParticipants,
  parseIngestPayload,
  type IngestParticipant,
  type RosterEntry,
} from "./ingest";

/**
 * Built from the same real client response the companion parses, so the
 * website's validation is tested against what will actually arrive rather
 * than against a payload invented to pass.
 */
function companionPayload(): Record<string, unknown> {
  const raw = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "companion", "fixtures", "custom-sr-game.json"),
      "utf8",
    ),
  ) as {
    gameId: number;
    gameCreationDate: string;
    gameDuration: number;
    participants: Array<{
      participantId: number;
      teamId: number;
      championId: number;
      stats: Record<string, number>;
      timeline: Record<string, string>;
    }>;
    participantIdentities: Array<{
      participantId: number;
      player: { gameName: string; tagLine: string; puuid: string };
    }>;
  };

  const identities = new Map(
    raw.participantIdentities.map((entry) => [entry.participantId, entry.player]),
  );

  return {
    gameId: raw.gameId,
    playedAt: raw.gameCreationDate,
    durationSeconds: raw.gameDuration,
    winner: "blue",
    queueId: 3110,
    gameVersion: "15.20",
    participants: raw.participants.map((participant) => {
      const player = identities.get(participant.participantId)!;
      return {
        puuid: player.puuid,
        riotId: `${player.gameName}#${player.tagLine}`,
        gameName: player.gameName,
        tagLine: player.tagLine,
        side: participant.teamId === 100 ? "blue" : "red",
        championId: participant.championId,
        kills: participant.stats.kills,
        deaths: participant.stats.deaths,
        assists: participant.stats.assists,
        cs:
          participant.stats.totalMinionsKilled +
          participant.stats.neutralMinionsKilled,
        gold: participant.stats.goldEarned,
        damage: participant.stats.totalDamageDealtToChampions,
        clientLane: participant.timeline.lane ?? null,
        clientRole: participant.timeline.role ?? null,
      };
    }),
  };
}

describe("parseIngestPayload", () => {
  it("accepts a payload built from a real game", () => {
    const result = parseIngestPayload(companionPayload());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.game.gameId).toBe(8020944938);
    expect(result.game.participants).toHaveLength(10);
    expect(result.game.durationSeconds).toBe(1958);
    expect(result.game.winner).toBe("blue");
  });

  it("rejects a body that is not an object", () => {
    for (const body of [null, 7, "game", []]) {
      expect(parseIngestPayload(body)).toMatchObject({ ok: false });
    }
  });

  it("rejects a missing or silly gameId", () => {
    expect(parseIngestPayload({ ...companionPayload(), gameId: 0 })).toMatchObject({
      ok: false,
      error: expect.stringContaining("gameId"),
    });
    expect(
      parseIngestPayload({ ...companionPayload(), gameId: "8020944938" }),
    ).toMatchObject({ ok: false });
  });

  it("rejects anything other than ten participants", () => {
    const payload = companionPayload();
    const nine = (payload.participants as unknown[]).slice(0, 9);

    expect(parseIngestPayload({ ...payload, participants: nine })).toMatchObject({
      ok: false,
      error: expect.stringContaining("exactly 10"),
    });
  });

  it("rejects lopsided sides", () => {
    const payload = companionPayload();
    const participants = (payload.participants as Array<{ side: string }>).map(
      (participant, index) => ({ ...participant, side: index < 6 ? "blue" : "red" }),
    );

    expect(parseIngestPayload({ ...payload, participants })).toMatchObject({
      ok: false,
      error: expect.stringContaining("5 players on blue"),
    });
  });

  it("rejects the same player twice", () => {
    const payload = companionPayload();
    const participants = payload.participants as Array<{ puuid: string }>;
    participants[1] = { ...participants[1], puuid: participants[0].puuid };

    expect(parseIngestPayload(payload)).toMatchObject({
      ok: false,
      error: expect.stringContaining("twice"),
    });
  });

  it("rejects a participant with no puuid", () => {
    const payload = companionPayload();
    const participants = payload.participants as Array<{ puuid: string }>;
    participants[3] = { ...participants[3], puuid: "" };

    expect(parseIngestPayload(payload)).toMatchObject({
      ok: false,
      error: expect.stringContaining("no puuid"),
    });
  });

  it("rejects an unknown winner", () => {
    expect(
      parseIngestPayload({ ...companionPayload(), winner: "purple" }),
    ).toMatchObject({ ok: false });
  });

  it("accepts a game nobody won", () => {
    const result = parseIngestPayload({ ...companionPayload(), winner: null });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.winner).toBeNull();
  });

  it("never lets negative stats through", () => {
    const payload = companionPayload();
    const participants = payload.participants as Array<{ kills: number }>;
    participants[0] = { ...participants[0], kills: -5 };

    const result = parseIngestPayload(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.game.participants[0].kills).toBe(0);
  });
});

describe("linkParticipants", () => {
  function participant(overrides: Partial<IngestParticipant>): IngestParticipant {
    return {
      puuid: "puuid-1",
      riotId: "Name#TAG",
      gameName: "Name",
      tagLine: "TAG",
      side: "blue",
      championId: 1,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      gold: 0,
      damage: 0,
      clientLane: null,
      clientRole: null,
      roleQuestItem: null,
      ...overrides,
    };
  }

  const roster: RosterEntry[] = [
    { id: 1, riotId: "Splurrp#EUW", puuid: "puuid-splurrp" },
    { id: 2, riotId: "Denshu#TTV", puuid: null },
    { id: 3, riotId: null, puuid: "puuid-esox" },
  ];

  it("matches on PUUID first", () => {
    const linked = linkParticipants(
      [participant({ puuid: "puuid-splurrp", riotId: "Someone else#EUW" })],
      roster,
    );

    expect(linked[0]).toMatchObject({ playerId: 1, matchedBy: "puuid" });
  });

  it("falls back to the Riot ID, ignoring case", () => {
    const linked = linkParticipants(
      [participant({ puuid: "unknown", riotId: "denshu#ttv" })],
      roster,
    );

    expect(linked[0]).toMatchObject({ playerId: 2, matchedBy: "riotId" });
  });

  it("leaves a stranger unlinked rather than guessing", () => {
    const linked = linkParticipants(
      [participant({ puuid: "nobody", riotId: "Stranger#EUW" })],
      roster,
    );

    expect(linked[0]).toMatchObject({ playerId: null, matchedBy: null });
  });

  it("never links two participants to the same player", () => {
    const linked = linkParticipants(
      [
        participant({ puuid: "puuid-splurrp" }),
        participant({ puuid: "other", riotId: "Splurrp#EUW" }),
      ],
      roster,
    );

    expect(linked[0].playerId).toBe(1);
    expect(linked[1].playerId).toBeNull();
  });
});

describe("findSuggestionMatch", () => {
  const playedAt = new Date("2026-10-21T21:34:00.000Z");
  const tenIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const linked = tenIds.map((id) => ({
    participant: {} as IngestParticipant,
    playerId: id,
    matchedBy: "puuid" as const,
  }));

  it("finds a suggestion with the same ten players nearby in time", () => {
    const found = findSuggestionMatch(
      [{ id: 42, playedAt: new Date("2026-10-21T21:00:00.000Z"), playerIds: tenIds }],
      linked,
      playedAt,
    );

    expect(found?.id).toBe(42);
  });

  it("ignores a suggestion from another day", () => {
    const found = findSuggestionMatch(
      [{ id: 42, playedAt: new Date("2026-10-18T21:00:00.000Z"), playerIds: tenIds }],
      linked,
      playedAt,
    );

    expect(found).toBeNull();
  });

  it("ignores a suggestion whose roster differs by one player", () => {
    const found = findSuggestionMatch(
      [
        {
          id: 42,
          playedAt,
          playerIds: [...tenIds.slice(0, 9), 99],
        },
      ],
      linked,
      playedAt,
    );

    expect(found).toBeNull();
  });

  it("picks the closest suggestion when an evening has several", () => {
    const found = findSuggestionMatch(
      [
        { id: 1, playedAt: new Date("2026-10-21T18:00:00.000Z"), playerIds: tenIds },
        { id: 2, playedAt: new Date("2026-10-21T21:20:00.000Z"), playerIds: tenIds },
      ],
      linked,
      playedAt,
    );

    expect(found?.id).toBe(2);
  });

  it("will not merge when somebody could not be linked", () => {
    const withStranger = [...linked.slice(0, 9), { ...linked[9], playerId: null }];

    const found = findSuggestionMatch(
      [{ id: 42, playedAt, playerIds: tenIds }],
      withStranger,
      playedAt,
    );

    expect(found).toBeNull();
  });
});
