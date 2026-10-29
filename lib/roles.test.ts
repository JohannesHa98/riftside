import { describe, expect, it } from "vitest";

import { assignRoles, type RoleClues } from "./roles";

function side(clues: Array<[number | null, number]>): RoleClues[] {
  return clues.map(([roleQuestItem, cs]) => ({ roleQuestItem, cs }));
}

describe("assignRoles", () => {
  it("takes the game's own word for it", () => {
    expect(
      assignRoles(
        side([
          [1221, 180],
          [1209, 160],
          [1206, 220],
          [null, 250],
          [1208, 30],
        ]),
      ),
    ).toEqual(["top", "jungle", "mid", "bot", "support"]);
  });

  it("separates bot from support by CS when neither has a reward", () => {
    expect(
      assignRoles(
        side([
          [1220, 190],
          [1209, 170],
          [1206, 210],
          [null, 40],
          [null, 260],
        ]),
      ),
    ).toEqual(["top", "jungle", "mid", "support", "bot"]);
  });

  it("never hands the same role to two players", () => {
    const roles = assignRoles(
      side([
        [1221, 200],
        [1221, 190],
        [1206, 210],
        [1209, 170],
        [1208, 30],
      ]),
    );

    expect(roles).toHaveLength(5);
    expect(new Set(roles).size).toBe(5);
    expect(roles[0]).toBe("top");
    // The second top reward is not a top: the game only hands out one.
    expect(roles[1]).toBe("bot");
  });

  it("falls back to CS order when the game said nothing at all", () => {
    expect(
      assignRoles(
        side([
          [null, 250],
          [null, 190],
          [null, 210],
          [null, 170],
          [null, 30],
        ]),
      ),
    ).toEqual(["bot", "mid", "top", "jungle", "support"]);
  });

  it("copes with missing CS", () => {
    const roles = assignRoles([
      { roleQuestItem: 1208, cs: null },
      { roleQuestItem: null, cs: null },
      { roleQuestItem: null, cs: null },
      { roleQuestItem: null, cs: null },
      { roleQuestItem: null, cs: null },
    ]);

    expect(roles[0]).toBe("support");
    expect(new Set(roles).size).toBe(5);
  });
});
