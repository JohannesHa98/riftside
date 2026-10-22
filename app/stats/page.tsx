import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState, PageHeader } from "@/components/ui";
import {
  countMatchesWithoutWinner,
  kdaRatio,
  playerStats,
  winRate,
  type PlayerStats,
} from "@/db/queries";
import { championIconUrl, championLabel, championNames } from "@/lib/champions";

export default function StatsPage() {
  return (
    <div>
      <PageHeader
        title="Stats"
        description="Games, win rate and KDA. Champions and KDA come from games the companion app picked up."
      />

      <Suspense fallback={<StatsSkeleton />}>
        <Table />
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
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-dim uppercase">
              <th className="px-4 py-2 font-medium">Player</th>
              <th className="px-2 py-2 text-right font-medium">Games</th>
              <th className="px-2 py-2 text-right font-medium">Win rate</th>
              <th className="px-2 py-2 text-right font-medium">KDA</th>
              <th className="px-4 py-2 font-medium">Most played</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {stats.map((player) => (
              <Row key={player.playerId} player={player} champions={champions} />
            ))}
          </tbody>
        </table>
      </div>

      {unrecorded > 0 ? (
        <p className="mt-3 text-sm text-ink-dim">
          {unrecorded} {unrecorded === 1 ? "game has" : "games have"} no winner
          recorded, so {unrecorded === 1 ? "it is" : "they are"} counted under
          Games but left out of Win rate.{" "}
          <Link href="/history" className="text-gold underline">
            Add the results
          </Link>{" "}
          to include {unrecorded === 1 ? "it" : "them"}.
        </p>
      ) : null}
    </>
  );
}

function Row({
  player,
  champions,
}: {
  player: PlayerStats;
  champions: Map<number, string>;
}) {
  const rate = winRate(player);
  const kda = kdaRatio(player);

  return (
    <tr className={player.archived ? "opacity-60" : undefined}>
      <td className="px-4 py-2">
        <span className="font-medium">{player.name}</span>
        {player.archived ? (
          <span className="ml-1 text-xs text-ink-dim">retired</span>
        ) : null}
      </td>

      <td className="px-2 py-2 text-right tabular-nums">
        {player.games}
        {player.games > player.decided ? (
          <span
            className="ml-1 text-xs text-ink-dim"
            title={`${player.games - player.decided} with no winner recorded`}
          >
            ({player.decided} counted)
          </span>
        ) : null}
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
            {player.champions.slice(0, 3).map((champion) => {
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
