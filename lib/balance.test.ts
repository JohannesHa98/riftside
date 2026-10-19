import { describe, expect, it } from "vitest";

import {
  balanceTeams,
  bestRoleAssignment,
  enumerateSplits,
  rankSplits,
  type BalancePlayer,
  type BalancedTeam,
} from "./balance";
import { ROLES, type Comfort, type Role } from "./types";

/** A player who is `ok` at everything unless told otherwise. */
function makePlayer(
  id: number,
  power: number,
  comfort: Partial<Record<Role, Comfort>> = {},
): BalancePlayer {
  return {
    id,
    name: `Player ${id}`,
    power,
    comfort: Object.fromEntries(
      ROLES.map((role) => [role, comfort[role] ?? "ok"]),
    ) as Record<Role, Comfort>,
  };
}

/** Good at one role, bad at every other. */
function makeMain(id: number, power: number, role: Role): BalancePlayer {
  const comfort = Object.fromEntries(
    ROLES.map((r) => [r, r === role ? "good" : "bad"]),
  ) as Record<Role, Comfort>;
  return { id, name: `${role} main ${id}`, power, comfort };
}

/** Ten players, `ok` everywhere, powers 1 through 10. */
function flexRoster(): BalancePlayer[] {
  return Array.from({ length: 10 }, (_, i) => makePlayer(i + 1, i + 1));
}

/** Two mains per role, so a bad-free split always exists. */
function specialistRoster(): BalancePlayer[] {
  return ROLES.flatMap((role, i) => [
    makeMain(i * 2 + 1, 5, role),
    makeMain(i * 2 + 2, 5, role),
  ]);
}

function playerIds(team: BalancedTeam): number[] {
  return team.assignments.map((a) => a.player.id).sort((a, b) => a - b);
}

describe("enumerateSplits", () => {
  it("produces the 126 unique splits, with no mirror duplicates", () => {
    expect(enumerateSplits(flexRoster())).toHaveLength(126);
  });

  it("gives every split two complete, non-overlapping teams of five", () => {
    const roster = flexRoster();
    const everyone = roster.map((p) => p.id).sort((a, b) => a - b);

    for (const split of enumerateSplits(roster)) {
      expect(split.blue.assignments).toHaveLength(5);
      expect(split.red.assignments).toHaveLength(5);

      const combined = [...playerIds(split.blue), ...playerIds(split.red)];
      expect(combined.sort((a, b) => a - b)).toEqual(everyone);
    }
  });

  it("gives each team all five roles exactly once", () => {
    for (const split of enumerateSplits(flexRoster())) {
      for (const team of [split.blue, split.red]) {
        expect(team.assignments.map((a) => a.role)).toEqual([...ROLES]);
      }
    }
  });
});

describe("role fit", () => {
  it("puts nobody on a bad role when a split exists that avoids it", () => {
    const [best] = balanceTeams(specialistRoster());

    expect(best.badCount).toBe(0);
    expect(best.goodCount).toBe(10);

    for (const team of [best.blue, best.red]) {
      expect(team.assignments.every((a) => a.comfort === "good")).toBe(true);
    }
  });

  it("does not stack the same role on one team when it can be avoided", () => {
    const [best] = balanceTeams(specialistRoster());
    const sortedRoles = [...ROLES].sort();

    for (const team of [best.blue, best.red]) {
      expect(team.assignments.map((a) => a.role).sort()).toEqual(sortedRoles);
    }
  });

  it("splits three adc players rather than piling them onto one team", () => {
    const adcMains = [1, 2, 3].map((id) => makeMain(id, 5, "adc"));
    const flex = [4, 5, 6, 7, 8, 9, 10].map((id) => makePlayer(id, 5));
    const adcIds = new Set(adcMains.map((p) => p.id));

    const suggestions = balanceTeams([...adcMains, ...flex], { limit: 10 });

    expect(suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestions) {
      for (const team of [suggestion.blue, suggestion.red]) {
        const mainsHere = playerIds(team).filter((id) => adcIds.has(id));
        expect(mainsHere.length).toBeLessThan(3);
      }
      // Two adc mains on one team means exactly one of them gives up adc.
      expect(suggestion.badCount).toBe(1);
    }
  });

  it("maximises good roles once bad roles are ruled out", () => {
    const roster = [
      makePlayer(1, 5, { top: "good" }),
      makePlayer(2, 5, { jungle: "good" }),
      makePlayer(3, 5, { mid: "good" }),
      makePlayer(4, 5, { adc: "good" }),
      makePlayer(5, 5, { support: "good" }),
      ...[6, 7, 8, 9, 10].map((id) => makePlayer(id, 5)),
    ];

    const [best] = balanceTeams(roster);

    expect(best.badCount).toBe(0);
    // All five specialists can be separated onto their own role.
    expect(best.goodCount).toBe(5);
  });
});

describe("team strength", () => {
  it("balances power when comfort gives no reason to prefer anything", () => {
    // Powers 1..10 sum to 55, so the closest possible split is 27 v 28.
    const [best] = balanceTeams(flexRoster());

    expect(best.powerDifference).toBe(1);
    expect(best.blue.totalPower + best.red.totalPower).toBe(55);
  });

  it("counts strength from power alone, never from comfort", () => {
    const roster = flexRoster().map((player, i) => ({
      ...player,
      comfort: Object.fromEntries(
        ROLES.map((role) => [role, i % 2 === 0 ? "good" : "bad"]),
      ) as Record<Role, Comfort>,
    }));

    for (const split of enumerateSplits(roster)) {
      const blueSum = split.blue.assignments.reduce((s, a) => s + a.player.power, 0);
      const redSum = split.red.assignments.reduce((s, a) => s + a.player.power, 0);

      expect(split.blue.totalPower).toBe(blueSum);
      expect(split.red.totalPower).toBe(redSum);
      expect(split.powerDifference).toBe(Math.abs(blueSum - redSum));
    }
  });
});

describe("rankSplits", () => {
  function score(
    id: string,
    powerDifference: number,
    goodCount: number,
    badCount = 0,
  ) {
    return { id, powerDifference, goodCount, badCount };
  }

  it("discards splits with bad roles entirely when a bad-free split exists", () => {
    const ranked = rankSplits([
      score("has-bad", 0, 10, 1),
      score("bad-free", 5, 0, 0),
    ]);

    expect(ranked.map((s) => s.id)).toEqual(["bad-free"]);
  });

  it("keeps the fewest bad roles when every split has some", () => {
    const ranked = rankSplits([
      score("two-bad", 0, 10, 2),
      score("one-bad", 4, 0, 1),
    ]);

    expect(ranked.map((s) => s.id)).toEqual(["one-bad"]);
  });

  it("prefers role fit over a power gap inside the tolerance band", () => {
    const splits = [score("tighter", 0, 4), score("friendlier", 1, 8)];

    expect(rankSplits(splits, 1)[0].id).toBe("friendlier");
  });

  it("prefers raw power balance once tolerance is turned off", () => {
    const splits = [score("tighter", 0, 4), score("friendlier", 1, 8)];

    expect(rankSplits(splits, 0)[0].id).toBe("tighter");
  });

  it("ignores role fit outside the tolerance band", () => {
    const splits = [score("tighter", 0, 4), score("lopsided", 6, 10)];

    expect(rankSplits(splits, 1).map((s) => s.id)).toEqual(["tighter", "lopsided"]);
  });

  it("breaks ties on good roles with the smaller power difference", () => {
    const splits = [score("wider", 1, 6), score("tighter", 0, 6)];

    expect(rankSplits(splits, 1).map((s) => s.id)).toEqual(["tighter", "wider"]);
  });

  it("returns nothing for no splits", () => {
    expect(rankSplits([])).toEqual([]);
  });
});

describe("balanceTeams", () => {
  it("offers three suggestions by default", () => {
    expect(balanceTeams(flexRoster())).toHaveLength(3);
  });

  it("returns the same answer for the same roster", () => {
    const roster = flexRoster();

    expect(balanceTeams(roster)).toEqual(balanceTeams(roster));
  });

  it("never offers a worse suggestion before a better one", () => {
    const suggestions = balanceTeams(flexRoster(), { limit: 5 });

    for (const [i, suggestion] of suggestions.entries()) {
      for (const later of suggestions.slice(i + 1)) {
        const betterFit = suggestion.goodCount >= later.goodCount;
        const tighter = suggestion.powerDifference <= later.powerDifference;
        expect(betterFit || tighter).toBe(true);
      }
    }
  });

  it("rejects a roster that is not exactly ten players", () => {
    expect(() => balanceTeams(flexRoster().slice(0, 9))).toThrow(/exactly 10 players/);
  });

  it("rejects the same player selected twice", () => {
    const roster = flexRoster();
    roster[9] = { ...roster[0] };

    expect(() => balanceTeams(roster)).toThrow(/more than once/);
  });
});

describe("bestRoleAssignment", () => {
  it("rejects a team that is not five players", () => {
    expect(() => bestRoleAssignment(flexRoster())).toThrow(/exactly 5 players/);
  });

  it("gives each specialist the role they are good at", () => {
    const team = ROLES.map((role, i) => makeMain(i + 1, 5, role));
    const assigned = bestRoleAssignment(team);

    expect(assigned.goodCount).toBe(5);
    expect(assigned.badCount).toBe(0);

    for (const { player, role } of assigned.assignments) {
      expect(player.comfort[role]).toBe("good");
    }
  });
});
