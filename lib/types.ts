/**
 * Shared vocabulary for the whole app.
 *
 * Deliberately free of any database or React imports: the balancer depends on
 * these types and must stay a pure module.
 */

export const ROLES = ["top", "jungle", "mid", "adc", "support"] as const;
export type Role = (typeof ROLES)[number];

/** How happy a player is to be put on a given role. */
export const COMFORTS = ["good", "ok", "bad"] as const;
export type Comfort = (typeof COMFORTS)[number];

export const TEAMS = ["blue", "red"] as const;
export type Team = (typeof TEAMS)[number];

export const MIN_POWER = 1;
export const MAX_POWER = 10;

export const ROLE_LABELS: Record<Role, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

/**
 * What players see. The stored values stay good/ok/bad; these labels answer
 * the question actually being asked — will you play this role?
 */
export const COMFORT_LABELS: Record<Comfort, string> = {
  good: "Yes",
  ok: "Maybe",
  bad: "No",
};
