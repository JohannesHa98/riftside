/**
 * Every database read the pages do, grouped by subject in ./queries.
 *
 * One door, so a page imports from "@/db/queries" without having to know
 * which of them a given query lives in.
 */

export * from "./queries/players";
export * from "./queries/matches";
export * from "./queries/shared";
export * from "./queries/ladder";
export * from "./queries/fun-stats";
export * from "./queries/spotlight";
export * from "./queries/login-attempts";
