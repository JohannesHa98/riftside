"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { PlayerName } from "@/components/player-name";
import { inputStyles } from "@/components/ui";
import type { ChampionRecord, GameHighlight, PlayerProfile } from "@/db/queries";

import { Radar, RadarLegend } from "./radar";
import { SPOTLIGHT_ANCHOR } from "./spotlight-link";

/** How many champions the spotlight lists under "Plays most". */
const CHAMPIONS_SHOWN = 10;

/**
 * One player, picked by search or by a name elsewhere on the page, drawn
 * against the group.
 *
 * Everything the panel needs is handed over at once — a couple of dozen
 * players with a dozen numbers each — so switching player is instant and
 * needs no round trip.
 *
 * Who is shown lives in `?player=`, because the names in the ladder and the
 * odds and ends are rendered on the server in their own Suspense boundaries
 * and have no other way to reach this component's state. The search box sets
 * the same parameter, so there is one answer to who is selected, and a
 * spotlight can be linked to.
 */
export function PlayerSpotlight({
  players,
  average,
  champions,
}: {
  players: PlayerProfile[];
  average: number[];
  champions: Record<number, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState("");

  const asked = Number(params.get("player"));
  const fromUrl = players.some((entry) => entry.playerId === asked) ? asked : null;

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

  const needle = query.trim().toLocaleLowerCase();

  const matches = useMemo(() => {
    if (needle.length === 0) return [];

    return players
      .filter((player) =>
        `${player.name} ${player.riotId ?? ""}`.toLocaleLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [players, needle]);

  const player = players.find((entry) => entry.playerId === selectedId) ?? null;

  if (player === null) return null;

  function choose(id: number) {
    setPicked(id);
    setQuery("");
    // replace, not push: flicking through players should not fill the back
    // button with every one of them. scroll: false because the panel is
    // already in view — the search box that was just used is inside it.
    router.replace(`/stats?player=${id}#${SPOTLIGHT_ANCHOR}`, { scroll: false });
  }

  return (
    <section id={SPOTLIGHT_ANCHOR} className="mt-8 scroll-mt-4">
      <h2 className="mb-3 text-xs font-semibold text-ink-dim uppercase">
        Player spotlight
      </h2>

      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex flex-wrap items-baseline gap-2">
              <PlayerName
                name={player.name}
                riotId={player.riotId}
                className="text-xl font-semibold"
              />
              <span className="text-sm text-gold tabular-nums">{player.power}</span>
              {player.rank !== null ? (
                <span className="text-xs text-ink-dim">rank {player.rank}</span>
              ) : (
                <span className="text-xs text-ink-dim">unranked</span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-ink-dim">
              {player.games} game{player.games === 1 ? "" : "s"}
              {player.games > player.decided
                ? ` · ${player.games - player.decided} unfinished`
                : ""}
            </p>
          </div>

          <div className="relative sm:w-64">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or Riot ID"
              aria-label="Search for a player to spotlight"
              className={inputStyles}
            />

            {matches.length > 0 ? (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-raised shadow-lg">
                {matches.map((entry) => (
                  <li key={entry.playerId}>
                    <button
                      type="button"
                      onClick={() => choose(entry.playerId)}
                      className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-panel"
                    >
                      <span className="mr-auto truncate">{entry.name}</span>
                      {entry.riotId === null ? null : (
                        <span className="truncate text-xs text-ink-dim">
                          {entry.riotId}
                        </span>
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
        </div>

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div>
            {/*
              The axes come from the player, not the page: someone who mostly
              supports has vision in place of farming.
            */}
            <Radar player={player} average={average} axes={player.axes} />
            <div className="mt-3">
              <RadarLegend name={player.name} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Tile
                label="Win rate"
                value={
                  player.decided === 0
                    ? "—"
                    : `${Math.round((player.wins / player.decided) * 100)}%`
                }
                note={`${player.wins}W–${player.decided - player.wins}L`}
              />
              <Tile
                label="KDA"
                value={player.kda === null ? "—" : player.kda.toFixed(1)}
                note="kills + assists per death"
              />
              <Tile
                label="Per game"
                value={
                  player.games === 0
                    ? "—"
                    : `${(player.kills / player.games).toFixed(1)}/${(player.deaths / player.games).toFixed(1)}/${(player.assists / player.games).toFixed(1)}`
                }
                note="K/D/A"
              />
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
                value={
                  player.killParticipation === null
                    ? "—"
                    : `${Math.round(player.killParticipation * 100)}%`
                }
                note="of their team's kills"
              />
            </div>

            {player.champions.length > 0 ? (
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
            ) : null}
          </div>
        </div>
      </div>
    </section>
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
