/**
 * Turns a raw dump from fixtures/raw into a committable test fixture.
 *
 * The raw dumps hold real summoner names, Riot IDs and PUUIDs. The structure
 * is what the parsing tests care about, so identities are replaced with stable
 * fakes and everything else is left exactly as the client sent it.
 *
 *   node scripts/make-fixture.mjs raw/game-detail-custom-sr.json custom-sr-game
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** One non-ASCII tagline is kept on purpose: a real one looked like this. */
const TAGLINES = ["EUW", "1337", "TTV", "테스트", "0000"];

const [source, name] = process.argv.slice(2);

if (!source || !name) {
  console.error("usage: node scripts/make-fixture.mjs <file under fixtures/> <output name>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(join("fixtures", source), "utf8"));
const redacted = redact(raw);
const out = join("fixtures", `${name}.json`);

writeFileSync(out, JSON.stringify(redacted, null, 2) + "\n", "utf8");
console.log(`wrote ${out}`);

function fakeFor(value, index) {
  return createHash("sha256")
    .update(String(value))
    .digest("hex")
    .slice(0, 36 - String(index).length) + String(index);
}

function redact(node, index = { n: 0 }) {
  if (Array.isArray(node)) return node.map((child) => redact(child, index));
  if (typeof node !== "object" || node === null) return node;

  const copy = {};
  for (const [key, value] of Object.entries(node)) {
    copy[key] = redact(value, index);
  }

  // A participant identity: swap the whole person out at once so the fake
  // gameName, tagLine and puuid stay consistent with each other.
  if (typeof copy.puuid === "string" && typeof copy.gameName === "string") {
    const n = ++index.n;
    copy.gameName = `Player${n}`;
    copy.tagLine = TAGLINES[n % TAGLINES.length];
    copy.puuid = fakeFor(copy.puuid, n);
    if (typeof copy.summonerName === "string") copy.summonerName = `Player${n}`;
    if ("accountId" in copy) copy.accountId = 100000 + n;
    if ("currentAccountId" in copy) copy.currentAccountId = 100000 + n;
    if ("summonerId" in copy) copy.summonerId = 200000 + n;
    if (typeof copy.matchHistoryUri === "string") {
      copy.matchHistoryUri = `/v1/stats/player_history/EUW1/${200000 + n}`;
    }
  }

  return copy;
}
