"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { PlayerName } from "@/components/player-name";
import { inputStyles } from "@/components/ui";
import type { PlayerProfile, SpotlightAxis } from "@/db/queries";

import { Radar, RadarLegend } from "./radar";

/**
 * One player, picked by search, drawn against the group.
 *
 * Everything the panel needs is handed over at once — a couple of dozen
 * players with a dozen numbers each — so switching player is instant and
 * needs no round trip.
 */
export function PlayerSpotlight({
  players,
  average,
  axes,
  champions,
}: {
  players: PlayerProfile[];
  average: number[];
  axes: SpotlightAxis[];
  champions: Record<number, string>;
}) {
  // Already sorted by ladder position, so the first is the player on top.
  const [selectedId, setSelectedId] = useState(players[0]?.playerId ?? null);
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

  const player = players.find((entry) => entry.playerId === selectedId) ?? null;

  if (player === null) return null;

  function choose(id: number) {
    setSelectedId(id);
    setQuery("");
  }

  return (
    <section className="mt-8">
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
            <Radar player={player} average={average} axes={axes} />
            <div className="mt-3">
              <RadarLegend />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                note="k / d / a"
              />
              <Tile
                label="Best game"
                value={
                  player.best === null
                    ? "—"
                    : `${player.best.kills}/${player.best.deaths}/${player.best.assists}`
                }
                note={
                  player.best?.championId
                    ? (champions[player.best.championId] ?? "most kills")
                    : "most kills"
                }
              />
            </div>

            {player.champions.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold text-ink-dim uppercase">
                  Plays most
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {player.champions.slice(0, 6).map((champion) => (
                    <li
                      key={champion.championId}
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
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      <p className="truncate text-xs text-ink-dim">{note}</p>
    </div>
  );
}
