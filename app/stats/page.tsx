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
  winRate,
  type PlayerStats,
} from "@/db/queries";
import { championIconUrl, championLabel, championNames } from "@/lib/champions";
import { dpmProfileUrl } from "@/lib/riot-id";

import { OddsAndEnds } from "./odds-and-ends";

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

      {/* Its own boundary, so the ladder is not held up by the extras. */}
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
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-136 text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-dim uppercase">
              <th className="w-10 py-2 pr-1 pl-4 text-right font-medium">#</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 text-right font-medium">Games</th>
              <th className="px-2 py-2 text-right font-medium">Win rate</th>
              <th className="px-2 py-2 text-right font-medium">KDA</th>
              <th className="px-4 py-2 font-medium">Most played</th>
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

/** How many champions each player's row shows. */
const MOST_PLAYED_SHOWN = 5;

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
  const profile = dpmProfileUrl(player.riotId);

  return (
    <tr className={player.archived ? "opacity-60" : undefined}>
      <td
        className="py-2 pr-1 pl-4 text-right text-ink-dim tabular-nums"
        title={
          rank === null
            ? `Unranked until ${MIN_RANKED_GAMES} games with a result`
            : undefined
        }
      >
        {rank ?? "—"}
      </td>

      <td className="px-2 py-2">
        {profile === null ? (
          <span className="font-medium">{player.name}</span>
        ) : (
          <a
            href={profile}
            target="_blank"
            rel="noopener noreferrer"
            title={`${player.name} on dpm.lol`}
            className="font-medium underline decoration-ink-dim/40 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            {player.name}
          </a>
        )}
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
        className="px-2 py-2 text-right tabular-nums"
        title={
          player.games > player.decided
            ? `${player.games - player.decided} further game(s) have no winner recorded`
            : undefined
        }
      >
        {player.decided}
      </td>

      <td className="px-2 py-2 text-right tabular-nums">
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

      <td className="px-2 py-2 text-right tabular-nums">
        {kda === null ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span title={`${player.kills}/${player.deaths}/${player.assists} over ${player.tracked} tracked games`}>
            {kda.toFixed(1)}
          </span>
        )}
      </td>

      <td className="px-4 py-2">
        {player.champions.length === 0 ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span className="flex items-center gap-1.5">
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
