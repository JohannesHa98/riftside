/**
 * Working out what role someone actually played.
 *
 * The rule is read off real games rather than documentation, so it lives in
 * one pure module: line-ups are ordered by it on the History page, and the
 * stats use it to tell a support's numbers apart from a laner's.
 */

import { ROLES, type Role } from "./types";

/**
 * The role quest reward the game hands out, which is the game itself saying
 * which role it assigned.
 */
export const ROLE_BY_QUEST_ITEM: Record<number, Role> = {
  1221: "top",
  1220: "top", // Unleashed Teleport, the other top reward
  1209: "jungle",
  1206: "mid",
  1208: "support",
};

/**
 * Roles in the order of how much CS they usually finish on, used to place
 * anyone the quest item did not identify — in practice the bot lane and the
 * support, whose rewards are often sold or replaced by the end of a game.
 */
export const ROLES_BY_EXPECTED_CS: Role[] = [
  "bot",
  "top",
  "mid",
  "jungle",
  "support",
];

/** The little a role needs to be worked out: the reward, and the CS. */
export interface RoleClues {
  roleQuestItem: number | null;
  cs: number | null;
}

/**
 * The role each of one side's five players played, in the order given.
 *
 * The quest reward decides it where there is one. It names top, jungle, mid
 * and support; the two it does not name are the bot lane and whoever sold
 * their support reward, and CS tells those apart with room to spare.
 *
 * The client's own `lane` is deliberately not used: it is derived from
 * movement and reported three junglers and no top in a real game of ours.
 */
export function assignRoles(side: RoleClues[]): Array<Role | null> {
  const assigned: Array<Role | null> = side.map(() => null);
  const taken = new Set<Role>();
  const undecided: number[] = [];

  side.forEach((player, index) => {
    const known =
      player.roleQuestItem === null
        ? undefined
        : ROLE_BY_QUEST_ITEM[player.roleQuestItem];

    if (known !== undefined && !taken.has(known)) {
      assigned[index] = known;
      taken.add(known);
    } else {
      undecided.push(index);
    }
  });

  const spare = ROLES_BY_EXPECTED_CS.filter((role) => !taken.has(role));
  undecided
    .sort((a, b) => (side[b].cs ?? 0) - (side[a].cs ?? 0))
    .forEach((index, place) => {
      assigned[index] = spare[place] ?? null;
    });

  return assigned;
}

/** Where a role sits in the usual top-to-support reading order. */
export function roleOrder(role: Role | null): number {
  return role === null ? ROLES.length : ROLES.indexOf(role);
}
