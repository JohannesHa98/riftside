import { describe, expect, it } from "vitest";

import { dpmProfileUrl, parsePuuid, parseRiotId, riotIdKey } from "./riot-id";

describe("parseRiotId", () => {
  it("accepts an ordinary Riot ID", () => {
    expect(parseRiotId("Splurrp#EUW")).toEqual({ ok: true, value: "Splurrp#EUW" });
  });

  it("accepts a non-ASCII tag, because a real player has one", () => {
    expect(parseRiotId("Splurrp#귀찮게하지")).toEqual({
      ok: true,
      value: "Splurrp#귀찮게하지",
    });
  });

  it("treats an empty field as clearing the value", () => {
    for (const input of ["", "   ", null, undefined]) {
      expect(parseRiotId(input)).toEqual({ ok: true, value: null });
    }
  });

  it("trims whitespace around each part", () => {
    expect(parseRiotId("  Name # TAG ")).toEqual({ ok: true, value: "Name#TAG" });
  });

  it("rejects an id without a tag", () => {
    expect(parseRiotId("JustAName")).toMatchObject({ ok: false });
    expect(parseRiotId("Name#")).toMatchObject({ ok: false });
    expect(parseRiotId("#TAG")).toMatchObject({ ok: false });
  });

  it("rejects an id with more than one hash", () => {
    expect(parseRiotId("Name#TAG#EXTRA")).toMatchObject({ ok: false });
  });

  it("rejects something far too long", () => {
    expect(parseRiotId(`${"n".repeat(40)}#TAG`)).toMatchObject({ ok: false });
    expect(parseRiotId(`Name#${"t".repeat(20)}`)).toMatchObject({ ok: false });
  });
});

describe("riotIdKey", () => {
  it("folds case so matching is not tripped by capitals", () => {
    expect(riotIdKey("Splurrp#EUW")).toBe(riotIdKey("splurrp#euw"));
  });

  it("is null for nothing", () => {
    expect(riotIdKey(null)).toBeNull();
    expect(riotIdKey("  ")).toBeNull();
  });
});

describe("parsePuuid", () => {
  it("accepts a realistic PUUID", () => {
    const puuid = "a".repeat(36);

    expect(parsePuuid(puuid)).toEqual({ ok: true, value: puuid });
  });

  it("treats an empty field as clearing the value", () => {
    expect(parsePuuid("")).toEqual({ ok: true, value: null });
  });

  it("rejects something that is plainly not one", () => {
    expect(parsePuuid("nope")).toMatchObject({ ok: false });
    expect(parsePuuid("has spaces in it and is long enough")).toMatchObject({
      ok: false,
    });
  });
});

describe("dpmProfileUrl", () => {
  it("builds the profile link from a Riot ID", () => {
    expect(dpmProfileUrl("ES0X#EUW")).toBe("https://dpm.lol/ES0X-EUW");
  });

  it("encodes a name with a space", () => {
    expect(dpmProfileUrl("Morot Bicepz#EUW")).toBe(
      "https://dpm.lol/Morot%20Bicepz-EUW",
    );
  });

  it("encodes a non-ASCII tag", () => {
    expect(dpmProfileUrl("Splurrp#귀찮게하지")).toBe(
      `https://dpm.lol/Splurrp-${encodeURIComponent("귀찮게하지")}`,
    );
  });

  it("has no link for a player without a Riot ID", () => {
    for (const value of [null, undefined, "", "   "]) {
      expect(dpmProfileUrl(value)).toBeNull();
    }
  });

  it("has no link for a malformed Riot ID", () => {
    expect(dpmProfileUrl("JustAName")).toBeNull();
    expect(dpmProfileUrl("Name#TAG#EXTRA")).toBeNull();
  });
});
