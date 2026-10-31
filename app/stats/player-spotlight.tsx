"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { PlayerName } from "@/components/player-name";
import { inputStyles } from "@/components/ui";
import {
  countsFor,
  gameScore,
  pairKey,
  type ChampionRecord,
  type GameHighlight,
  type PairRecords,
  type PlayerProfile,
  type SpotlightAxis,
} from "@/db/queries";

import {
  Radar,
  RadarLegend,
  type RadarContext,
  type RadarSubject,
} from "./radar";
import { SPOTLIGHT_ANCHOR, spotlightUrl } from "./spotlight-link";

/** How many champions the spotlight lists under "Plays most". */
const CHAMPIONS_SHOWN = 10;

/**
 * One player drawn against the group, or against another player.
 *
 * Everything the panel needs is handed over at once — a couple of dozen
 * players with a dozen numbers each, plus every pair's record — so switching
 * player or opponent is instant and needs no round trip.
 *
 * Who is shown lives in `?player=` and `?against=`, because the names in the
 * ladder and the odds and ends are rendered on the server in their own
 * Suspense boundaries and have no other way to reach this component's state.
 * The search boxes set the same parameters, so there is one answer to who is
 * selected, and any comparison can be linked to.
 */
export function PlayerSpotlight({
  players,
  average,
  champions,
  pairs,
}: {
  players: PlayerProfile[];
  average: number[];
  champions: Record<number, string>;
  pairs: PairRecords;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const find = (name: string | null) => {
    const needle = (name ?? "").toLocaleLowerCase();
    if (needle.length === 0) return null;
    return players.find((entry) => entry.name.toLocaleLowerCase() === needle) ?? null;
  };

  // Matched without case, so a link somebody typed by hand still lands.
  const fromUrl = find(params.get("player"))?.playerId ?? null;
  const rivalFromUrl = find(params.get("against"));

  // The search box selects before the URL has caught up, so its choice stands
  // until the parameter changes — at which point the URL wins again, which is
  // what makes a click on a name in the ladder take effect.
  const [picked, setPicked] = useState<number | null>(null);
  const [seenInUrl, setSeenInUrl] = useState(fromUrl);

  if (fromUrl !== seenInUrl) {
    setSeenInUrl(fromUrl);
    setPicked(null);
  }

  // Already sorted by ladder position, so the first is the player on top.
  const selectedId = picked ?? fromUrl ?? players[0]?.playerId ?? null;
  const player = players.find((entry) => entry.playerId === selectedId) ?? null;

  // Nobody is their own rival, however the URL was typed.
  const rival =
    rivalFromUrl !== null && rivalFromUrl.playerId !== selectedId ? rivalFromUrl : null;

  if (player === null) return null;

  function show(subject: PlayerProfile, against: PlayerProfile | null) {
    setPicked(subject.playerId);
    // replace, not push: flicking through players should not fill the back
    // button with every one of them. scroll: false because the panel is
    // already in view — the search box that was just used is inside it.
    router.replace(spotlightUrl(subject.name, against?.name ?? null), {
      scroll: false,
    });
  }

  const record =
    rival === null ? null : (pairs[pairKey(player.playerId, rival.playerId)] ?? null);
  const view = comparable(player, rival, average, players);

  return (
    <section id={SPOTLIGHT_ANCHOR} className="mt-8 scroll-mt-4">
      <h2 className="mb-3 text-xs font-semibold text-ink-dim uppercase">
        {rival === null ? "Player spotlight" : "Head to head"}
      </h2>

      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex flex-wrap items-baseline gap-2">
              <PlayerName
                name={player.name}
                riotId={player.riotId}
                className={`text-xl font-semibold ${rival === null ? "" : "text-gold"}`}
              />
              {rival === null ? null : (
                <>
                  <span aria-hidden className="text-xl text-ink-dim">
                    &ndash;
                  </span>
                  <PlayerName
                    name={rival.name}
                    riotId={rival.riotId}
                    className="text-xl font-semibold text-blue-side"
                  />
                  <button
                    type="button"
                    onClick={() => show(player, null)}
                    title={`Stop comparing with ${rival.name}`}
                    aria-label={`Stop comparing with ${rival.name}`}
                    className="-ml-0.5 grid size-5 place-items-center self-center rounded-full text-ink-dim transition-colors hover:bg-raised hover:text-ink"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      className="size-3 fill-none stroke-current stroke-[3]"
                    >
                      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </>
              )}
              {rival !== null ? null : (
                <>
                  <span className="text-sm text-gold tabular-nums">{player.power}</span>
                  {player.rank !== null ? (
                    <span className="text-xs text-ink-dim">rank {player.rank}</span>
                  ) : (
                    <span className="text-xs text-ink-dim">unranked</span>
                  )}
                </>
              )}
            </p>
            {rival !== null ? null : (
              <p className="mt-0.5 text-sm text-ink-dim">
                {player.games} game{player.games === 1 ? "" : "s"}
                {player.games > player.decided
                  ? ` · ${player.games - player.decided} unfinished`
                  : ""}
              </p>
            )}
          </div>

          {/*
            Side by side, not stacked: two full-width boxes above the chart
            pushed the whole panel down the page for no reason.
          */}
          <div className="grid gap-2 sm:w-[26rem] sm:grid-cols-2">
            <PlayerSearch
              players={players}
              label="Search for a player to spotlight"
              placeholder="Search a player"
              onPick={(entry) => show(entry, rival)}
            />
            {/*
              Always "Compare with", never the current opponent: a box that
              names what it holds reads as a field someone has filled in, and
              this one is empty — typing in it replaces them.
            */}
            <PlayerSearch
              players={players.filter((entry) => entry.playerId !== player.playerId)}
              label="Search for a player to compare with"
              placeholder="Compare with…"
              onPick={(entry) => show(player, entry)}
            />
          </div>
        </div>

        {/*
          A fixed first column rather than auto: the chart is a w-full svg,
          which an auto column sizes from nothing and squashes. Both columns
          start at the same line — the chart's canvas is cut to its contents,
          so its first ink sits level with the first box beside it.
        */}
        <div className="grid items-start gap-6 lg:grid-cols-[26rem_1fr]">
          <div>
            {/*
              The axes come from the player, not the page: someone who mostly
              supports has vision in place of farming. Comparing two of those
              keeps only the axes they share — see `comparable`.
            */}
            <Radar axes={view.axes} subject={view.subject} context={view.context} />
            <div className="mt-3 space-y-1">
              <RadarLegend subject={player.name} context={view.context} />
              {view.dropped === null ? null : (
                <p className="text-xs text-ink-dim">{view.dropped} left out.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {rival === null ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Tile
                  label="Win rate"
                  value={winRateOf(player)}
                  note={`${player.wins}W–${player.decided - player.wins}L`}
                />
                <Tile
                  label="KDA"
                  value={player.kda === null ? "—" : player.kda.toFixed(1)}
                  note="kills + assists per death"
                />
                <Tile label="Per game" value={perGameOf(player)} note="K/D/A" />
                <Tile
                  label="Best game"
                  value={scoreline(player.best)}
                  note={championOf(player.best, champions)}
                />
                <Tile
                  label="Worst game"
                  value={scoreline(player.worst)}
                  note={championOf(player.worst, champions)}
                />
                <Tile
                  label="Kill participation"
                  value={participationOf(player)}
                  // Participation already implies the team; assists do not.
                  note="their kills + assists"
                />
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Tile
                    label="Head to head"
                    value={
                      record === null || record.against.games === 0
                        ? "—"
                        : scoreOf(record.against, player.playerId, rival.playerId)
                    }
                    note={
                      record === null || record.against.games === 0
                        ? "never on opposite sides"
                        : `${record.against.games} game${record.against.games === 1 ? "" : "s"} against each other`
                    }
                  />
                  <Tile
                    label="As teammates"
                    value={
                      record === null || record.together.games === 0
                        ? "—"
                        : `${record.together.wins}W–${record.together.games - record.together.wins}L`
                    }
                    note={
                      record === null || record.together.games === 0
                        ? "never on the same side"
                        : `${record.together.games} game${record.together.games === 1 ? "" : "s"} together`
                    }
                  />
                </div>

                <dl className="divide-y divide-line overflow-hidden rounded-md border border-line">
                <Facing label="Games" a={`${player.decided}`} b={`${rival.decided}`} />
                <Facing
                  label="Win rate"
                  a={winRateOf(player)}
                  b={winRateOf(rival)}
                  better={compare(rateOf(player), rateOf(rival))}
                />
                <Facing
                  label="KDA"
                  a={player.kda === null ? "—" : player.kda.toFixed(1)}
                  b={rival.kda === null ? "—" : rival.kda.toFixed(1)}
                  better={compare(player.kda, rival.kda)}
                />
                <Facing
                  label="Per game"
                  a={perGameOf(player)}
                  b={perGameOf(rival)}
                  better={compare(perGameScore(player), perGameScore(rival))}
                />
                <Facing
                  label="Kill participation"
                  a={participationOf(player)}
                  b={participationOf(rival)}
                  better={compare(player.killParticipation, rival.killParticipation)}
                />
                <Facing
                  label="Best game"
                  a={scoreline(player.best)}
                  b={scoreline(rival.best)}
                  better={compare(bestScore(player), bestScore(rival))}
                />
              </dl>
              </>
            )}

            {rival !== null || player.champions.length === 0 ? null : (
              <div>
                <h3 className="mb-2 text-xs font-semibold text-ink-dim uppercase">
                  Plays most
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {player.champions.slice(0, CHAMPIONS_SHOWN).map((champion) => (
                    <li
                      key={champion.championId}
                      title={`${champion.games} game${champion.games === 1 ? "" : "s"}${
                        champion.decided === 0
                          ? ", none with a result recorded"
                          : ` · ${champion.wins}W-${champion.decided - champion.wins}L`
                      }`}
                      className="flex items-center gap-1.5 rounded-md border border-line bg-surface/60 px-2 py-1"
                    >
                      <Image
                        src={`https://cdn.communitydragon.org/latest/champion/${champion.championId}/square`}
                        alt={champions[champion.championId] ?? `#${champion.championId}`}
                        width={20}
                        height={20}
                        unoptimized
                        className="size-5 rounded"
                      />
                      <span className="text-sm">
                        {champions[champion.championId] ?? `#${champion.championId}`}
                      </span>
                      <span className="text-xs text-ink-dim tabular-nums">
                        {champion.games}
                      </span>
                      <ChampionWinRate champion={champion} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Lower is better on exactly one axis. */
const LOWER_IS_BETTER = new Set(["survival"]);

function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] ?? "th"}`;
}

/**
 * Where one player's figure places among everyone measured the same way.
 *
 * Only players who share that axis are counted — a support's vision is ranked
 * against the other supports, never against the laners' CS, which is the same
 * rule the chart itself is scaled by.
 */
function places(players: PlayerProfile[], subject: PlayerProfile): string[] {
  const played = players.filter((entry) => entry.games > 0);

  return subject.axes.map((axis, index) => {
    const field = played.filter((entry) => entry.axes[index].key === axis.key);
    const mine = subject.raw[index];
    const better = LOWER_IS_BETTER.has(axis.key)
      ? (value: number) => value < mine
      : (value: number) => value > mine;

    return ordinal(field.filter((entry) => better(entry.raw[index])).length + 1);
  });
}

/** Axis keys in the words a player would use for them. */
const MEASURES: Record<string, string> = {
  farming: "CS",
  vision: "vision score",
  survival: "deaths",
  winRate: "win rate",
};

/**
 * The axes two players can honestly be drawn on together.
 *
 * Someone who mostly supports spends the fourth slot on vision while everyone
 * else spends it on CS, and the two are scaled against different groups. Shown
 * side by side they would read as a comparison, so that axis comes out and the
 * chart says why.
 */
function comparable(
  player: PlayerProfile,
  rival: PlayerProfile | null,
  average: number[],
  everyone: PlayerProfile[],
): {
  axes: SpotlightAxis[];
  subject: RadarSubject;
  context: RadarContext;
  dropped: string | null;
} {
  const standing = places(everyone, player);

  if (rival === null) {
    return {
      axes: player.axes,
      subject: {
        name: player.name,
        values: player.radar,
        raw: player.raw,
        places: standing,
      },
      context: { name: "Everyone's average", values: average, rival: false },
      dropped: null,
    };
  }

  const rivalStanding = places(everyone, rival);

  const shared = player.axes
    .map((axis, index) => index)
    .filter((index) => player.axes[index].key === rival.axes[index].key);

  // Name the measures rather than the slot: "CS and vision score left out"
  // says what happened, where "Farming is left off" asks the reader to work
  // out which axis that was and why it would not sit beside the other one.
  const odd = [...new Set(
    player.axes
      .flatMap((_, index) =>
        shared.includes(index)
          ? []
          : [player.axes[index].key, rival.axes[index].key],
      )
      .map((key) => MEASURES[key] ?? key),
  )];

  return {
    axes: shared.map((index) => player.axes[index]),
    subject: {
      name: player.name,
      values: shared.map((index) => player.radar[index]),
      raw: shared.map((index) => player.raw[index]),
      places: shared.map((index) => standing[index]),
    },
    context: {
      name: rival.name,
      values: shared.map((index) => rival.radar[index]),
      raw: shared.map((index) => rival.raw[index]),
      places: shared.map((index) => rivalStanding[index]),
      rival: true,
    },
    dropped: odd.length === 0 ? null : odd.join(" and "),
  };
}

/** A head-to-head score, always read left to right as the panel shows it. */
function scoreOf(
  against: { games: number; wins: number },
  player: number,
  rival: number,
): string {
  const wins = countsFor(player, rival) ? against.wins : against.games - against.wins;
  return `${wins}–${against.games - wins}`;
}

const rateOf = (p: PlayerProfile) => (p.decided === 0 ? null : p.wins / p.decided);

function winRateOf(p: PlayerProfile): string {
  const rate = rateOf(p);
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/**
 * Both of these are read with `gameScore` — kills, assists at half, deaths
 * taken off — which is how the site already decides whose game was better.
 * A line of three numbers has no order until something says what counts.
 */
const bestScore = (p: PlayerProfile) => (p.best === null ? null : gameScore(p.best));

function perGameScore(p: PlayerProfile): number | null {
  if (p.games === 0) return null;
  return gameScore({
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    championId: null,
  }) / p.games;
}

function perGameOf(p: PlayerProfile): string {
  if (p.games === 0) return "—";
  return `${(p.kills / p.games).toFixed(1)}/${(p.deaths / p.games).toFixed(1)}/${(p.assists / p.games).toFixed(1)}`;
}

function participationOf(p: PlayerProfile): string {
  return p.killParticipation === null
    ? "—"
    : `${Math.round(p.killParticipation * 100)}%`;
}

/** Which side of a facing row is ahead, when the question has an answer. */
function compare(a: number | null, b: number | null): "a" | "b" | null {
  if (a === null || b === null || a === b) return null;
  return a > b ? "a" : "b";
}

function PlayerSearch({
  players,
  label,
  placeholder,
  onPick,
}: {
  players: PlayerProfile[];
  label: string;
  placeholder: string;
  onPick: (player: PlayerProfile) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();

  const matches = useMemo(() => {
    if (needle.length === 0) return [];

    return players
      .filter((player) =>
        `${player.name} ${player.riotId ?? ""}`.toLocaleLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [players, needle]);

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={inputStyles}
      />

      {matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-raised shadow-lg">
          {matches.map((entry) => (
            <li key={entry.playerId}>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  onPick(entry);
                }}
                className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-panel"
              >
                <span className="mr-auto truncate">{entry.name}</span>
                {entry.riotId === null ? null : (
                  <span className="truncate text-xs text-ink-dim">{entry.riotId}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {needle.length > 0 && matches.length === 0 ? (
        <p className="absolute mt-1 w-full rounded-md border border-line bg-raised px-3 py-2 text-sm text-ink-dim">
          Nobody matches that.
        </p>
      ) : null}
    </div>
  );
}

/** One stat, both players, the label between them. */
function Facing({
  label,
  a,
  b,
  better,
}: {
  label: string;
  a: string;
  b: string;
  better?: "a" | "b" | null;
}) {
  const side = (value: string, mine: "a" | "b") => {
    const ahead = better === mine;
    const colour = mine === "a" ? "text-gold" : "text-blue-side";
    return (
      <dd
        className={`tabular-nums ${mine === "a" ? "text-right" : "text-left"} ${
          ahead ? `font-semibold ${colour}` : "text-ink"
        }`}
      >
        {value}
      </dd>
    );
  };

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 px-3 py-2 text-sm">
      {side(a, "a")}
      <dt className="text-center text-xs text-ink-dim uppercase">{label}</dt>
      {side(b, "b")}
    </div>
  );
}

/**
 * The win rate on one champion, which is often over one or two games — so the
 * record itself sits in the tile's title, where the sample size is visible
 * rather than hidden behind a round number.
 */
function ChampionWinRate({ champion }: { champion: ChampionRecord }) {
  if (champion.decided === 0) {
    return <span className="text-xs text-ink-dim">&mdash;</span>;
  }

  const rate = champion.wins / champion.decided;

  return (
    <span
      className={`text-xs tabular-nums ${rate >= 0.5 ? "text-good" : "text-ink-dim"}`}
    >
      {Math.round(rate * 100)}%
    </span>
  );
}

function scoreline(game: GameHighlight | null): string {
  return game === null ? "—" : `${game.kills}/${game.deaths}/${game.assists}`;
}

function championOf(
  game: GameHighlight | null,
  champions: Record<number, string>,
): string {
  if (game?.championId == null) return "—";
  return champions[game.championId] ?? `#${game.championId}`;
}

function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface/60 px-3 py-2">
      <p className="text-xs text-ink-dim uppercase">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-ink-dim">{note}</p>
    </div>
  );
}
