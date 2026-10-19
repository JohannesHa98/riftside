import type { Player } from "@/db/schema";

import type { BalancePlayer } from "./balance";
import { ROLES, type Comfort, type Role } from "./types";

/** Which players column holds the comfort for each role. */
const COMFORT_FIELDS = {
  top: "topComfort",
  jungle: "jungleComfort",
  mid: "midComfort",
  adc: "adcComfort",
  support: "supportComfort",
} as const satisfies Record<Role, keyof Player>;

export function comfortOf(player: Player, role: Role): Comfort {
  return player[COMFORT_FIELDS[role]];
}

export function comfortMap(player: Player): Record<Role, Comfort> {
  return Object.fromEntries(
    ROLES.map((role) => [role, comfortOf(player, role)]),
  ) as Record<Role, Comfort>;
}

/** Narrow a database row to what the balancer actually needs. */
export function toBalancePlayer(player: Player): BalancePlayer {
  return {
    id: player.id,
    name: player.name,
    power: player.power,
    comfort: comfortMap(player),
  };
}
