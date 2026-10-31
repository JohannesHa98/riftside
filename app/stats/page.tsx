import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState, PageHeader } from "@/components/ui";
import {
  MIN_RANKED_GAMES,
  countMatchesWithoutWinner,
  isRanked,
  kdaRatio,
  playerStats,
  spotlight,
  winRate,
  type PlayerStats,
} from "@/db/queries";
import { championIconUrl, championLabel, championNames } from "@/lib/champions";

import { OddsAndEnds } from "./odds-and-ends";
import { PlayerSpotlight } from "./player-spotlight";
import { SpotlightLink } from "./spotlight-link";

export default function StatsPage() {
  return (
    <div>
      <PageHeader
        title="Stats"
        description={`Ranked by win rate, after ${MIN_RANKED_GAMES} games with a recorded result. A tie goes to whoever held the rate over more games.`}
      />

      <Suspense fallback={<StatsSkeleton />}>
        <Table />
      </Suspense>

      {/* Each has its own boundary, so neither holds up the ladder. */}
      <Suspense fallback={null}>
        <Spotlight />
      </Suspense>

      <Suspense fallback={null}>
        <OddsAndEnds />
      </Suspense>
    </div>
  );
}

async function Table() {
  const [stats, champions, unrecorded] = await Promise.all([
    playerStats(),
    championNames(),
    countMatchesWithoutWinner(),
  ]);

  if (stats.length === 0) {
    return <EmptyState>No games recorded yet, so there is nothing to count.</EmptyState>;
  }

  return (
    <>
      <div className="scroll-x rounded-lg border border-line bg-panel">
        <table className="w-full min-w-136 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-dim uppercase">
              <th scope="col" className="w-10 px-2 py-2 text-center font-medium">#</th>
              <th scope="col" className="px-2 py-2 font-medium">Player</th>
              <th scope="col" className="px-2 py-2 text-center font-medium">Games</th>
              <th scope="col" className="px-2 py-2 text-center font-medium">Win rate</th>
              <th scope="col" className="px-2 py-2 text-center font-medium">KDA</th>
              <th scope="col" className="px-4 py-2 text-center font-medium">Most played</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {withRanks(stats).map(({ player, rank }) => (
              <Row
                key={player.playerId}
                player={player}
                rank={rank}
                champions={champions}
              />
            ))}
          </tbody>
        </table>
      </div>

      {unrecorded > 0 ? (
        <p className="mt-3 text-sm text-ink-dim">
          {unrecorded} {unrecorded === 1 ? "game has" : "games have"} no winner
          recorded, so {unrecorded === 1 ? "it is" : "they are"} left out
          entirely.{" "}
          <Link href="/history" className="text-gold underline">
            Add the results
          </Link>{" "}
          to count {unrecorded === 1 ? "it" : "them"}.
        </p>
      ) : null}
    </>
  );
}

/** Positions count the ranked players only, so the ladder reads 1, 2, 3. */
function withRanks(stats: PlayerStats[]): Array<{
  player: PlayerStats;
  rank: number | null;
}> {
  let position = 0;

  return stats.map((player) => ({
    player,
    rank: isRanked(player) ? ++position : null,
  }));
}

async function Spotlight() {
  const [data, names] = await Promise.all([spotlight(), championNames()]);

  if (data.players.length === 0) return null;

  // A Map does not survive the trip to a client component; an object does.
  const champions = Object.fromEntries(names);

  return (
    <PlayerSpotlight
      players={data.players}
      average={data.average}
      champions={champions}
    />
  );
}

/** How many champions each player's row shows. */
const MOST_PLAYED_SHOWN = 3;

function Row({
  player,
  rank,
  champions,
}: {
  player: PlayerStats;
  rank: number | null;
  champions: Map<number, string>;
}) {
  const rate = winRate(player);
  const kda = kdaRatio(player);

  return (
    <tr className={player.archived ? "opacity-60" : undefined}>
      <td
        className="px-2 py-2 text-center text-ink-dim tabular-nums"
        title={
          rank === null
            ? `Unranked until ${MIN_RANKED_GAMES} games with a result`
            : undefined
        }
      >
        {rank ?? "—"}
      </td>

      <td className="px-2 py-2">
        <SpotlightLink name={player.name} className="font-medium" />
        <span
          title="Power level, used by the balancer"
          className="ml-1.5 text-xs text-gold tabular-nums"
        >
          {player.power}
        </span>
        {player.archived ? (
          <span className="ml-1 text-xs text-ink-dim">retired</span>
        ) : null}
      </td>

      <td
        className="px-2 py-2 text-center tabular-nums"
        title={
          player.games > player.decided
            ? `${player.games - player.decided} further game(s) have no winner recorded`
            : undefined
        }
      >
        {player.decided}
      </td>

      <td className="px-2 py-2 text-center tabular-nums">
        {rate === null ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span className={rate >= 0.5 ? "text-good" : "text-ink"}>
            {Math.round(rate * 100)}%
            <span className="ml-1 text-xs text-ink-dim">
              {player.wins}W–{player.decided - player.wins}L
            </span>
          </span>
        )}
      </td>

      <td className="px-2 py-2 text-center tabular-nums">
        {kda === null ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span title={`${player.kills}/${player.deaths}/${player.assists} over ${player.tracked} tracked games`}>
            {kda.toFixed(1)}
          </span>
        )}
      </td>

      <td className="px-4 py-2 text-center">
        {player.champions.length === 0 ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span className="flex items-center justify-center gap-1.5">
            {player.champions.slice(0, MOST_PLAYED_SHOWN).map((champion) => {
              const icon = championIconUrl(champion.championId);
              const name = championLabel(champions, champion.championId);

              return (
                <span
                  key={champion.championId}
                  title={`${name} — ${champion.games} game${champion.games === 1 ? "" : "s"}`}
                  className="flex items-center gap-1"
                >
                  {icon === null ? null : (
                    <Image
                      src={icon}
                      alt={name}
                      width={20}
                      height={20}
                      unoptimized
                      className="size-5 rounded"
                    />
                  )}
                  <span className="text-xs text-ink-dim tabular-nums">
                    {champion.games}
                  </span>
                </span>
              );
            })}
          </span>
        )}
      </td>
    </tr>
  );
}

function StatsSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-lg border border-line bg-panel/60" aria-hidden />
  );
}
