import Image from "next/image";
import { Suspense } from "react";

import { EmptyState, PageHeader } from "@/components/ui";
import {
  listMatches,
  totalPower,
  type MatchParticipant,
  type MatchSummary,
} from "@/db/queries";
import { isSignedIn } from "@/lib/auth";
import { championIconUrl, championLabel, championNames } from "@/lib/champions";
import { ROLE_LABELS, type Team } from "@/lib/types";

import { DeleteMatchButton } from "./delete-match-button";
import { WinnerButtons } from "./winner-buttons";

export default function HistoryPage() {
  return (
    <div>
      <PageHeader title="History" description="Every game played so far." />

      <Suspense fallback={<HistorySkeleton />}>
        <Matches />
      </Suspense>
    </div>
  );
}

async function Matches() {
  const [matches, canEdit, champions] = await Promise.all([
    listMatches(),
    isSignedIn(),
    championNames(),
  ]);

  if (matches.length === 0) {
    return (
      <EmptyState>
        No games yet. Split some teams on the New game page and save them here.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          canEdit={canEdit}
          champions={champions}
        />
      ))}
    </div>
  );
}

function MatchCard({
  match,
  canEdit,
  champions,
}: {
  match: MatchSummary;
  canEdit: boolean;
  champions: Map<number, string>;
}) {
  return (
    <details className="rounded-lg border border-line bg-panel">
      <summary className="flex list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 select-none">
        <time
          dateTime={match.playedAt.toISOString()}
          className="text-sm text-ink-dim tabular-nums"
        >
          {match.playedAt.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </time>

        <span className="text-sm">
          <Side side="blue" power={totalPower(match.blue)} winner={match.winner} />
          <span className="text-ink-dim"> v </span>
          <Side side="red" power={totalPower(match.red)} winner={match.winner} />
        </span>

        {match.durationSeconds !== null ? (
          <span className="text-xs text-ink-dim tabular-nums">
            {Math.round(match.durationSeconds / 60)} min
          </span>
        ) : null}

        {match.fromRiot ? (
          <span
            title="Picked up automatically from the League client"
            className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold uppercase"
          >
            Tracked
          </span>
        ) : null}

        <span className="ml-auto text-xs text-ink-dim">Line-ups</span>
      </summary>

      <div className="border-t border-line p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Lineup
            side="blue"
            players={match.blue}
            winner={match.winner}
            champions={champions}
          />
          <Lineup
            side="red"
            players={match.red}
            winner={match.winner}
            champions={champions}
          />
        </div>

        {canEdit ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <WinnerButtons matchId={match.id} winner={match.winner} />
            <DeleteMatchButton
              matchId={match.id}
              playedAt={match.playedAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Side({
  side,
  power,
  winner,
}: {
  side: Team;
  power: number;
  winner: Team | null;
}) {
  const won = winner === side;
  const colour = side === "blue" ? "text-blue-side" : "text-red-side";

  return (
    <span className={`${colour} ${won ? "font-bold" : ""}`}>
      {power}
      {won ? " ✓" : ""}
    </span>
  );
}

function Lineup({
  side,
  players,
  winner,
  champions,
}: {
  side: Team;
  players: MatchParticipant[];
  winner: Team | null;
  champions: Map<number, string>;
}) {
  const colour = side === "blue" ? "text-blue-side" : "text-red-side";
  const label = side === "blue" ? "Blue side" : "Red side";

  return (
    <section>
      <h3 className={`mb-1 text-xs font-semibold uppercase ${colour}`}>
        {label}
        {winner === side ? <span className="ml-1 text-good">won</span> : null}
      </h3>

      <ul className="divide-y divide-line/60">
        {players.map((player, index) => (
          <ParticipantRow
            key={player.playerId ?? `unlinked-${index}`}
            player={player}
            champions={champions}
          />
        ))}
      </ul>
    </section>
  );
}

function ParticipantRow({
  player,
  champions,
}: {
  player: MatchParticipant;
  champions: Map<number, string>;
}) {
  const icon = championIconUrl(player.championId);
  const hasStats = player.kills !== null;

  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      {icon !== null ? (
        <Image
          src={icon}
          alt={championLabel(champions, player.championId)}
          title={championLabel(champions, player.championId)}
          width={24}
          height={24}
          unoptimized
          className="size-6 shrink-0 rounded"
        />
      ) : (
        <span className="w-12 shrink-0 text-xs text-ink-dim">
          {player.role ? ROLE_LABELS[player.role] : "—"}
        </span>
      )}

      <span className="mr-auto min-w-0 truncate">
        {player.name}
        {player.unlinked ? (
          <span
            title="Not linked to a player yet — set their Riot ID on the Players page"
            className="ml-1 rounded border border-line px-1 text-[10px] text-ink-dim"
          >
            unlinked
          </span>
        ) : null}
      </span>

      {hasStats ? (
        <>
          <span className="shrink-0 text-xs tabular-nums" title="Kills / deaths / assists">
            {player.kills}/{player.deaths}/{player.assists}
          </span>
          <span
            className="hidden shrink-0 text-xs text-ink-dim tabular-nums sm:inline"
            title="Creep score"
          >
            {player.cs} cs
          </span>
          <span
            className="hidden shrink-0 text-xs text-ink-dim tabular-nums md:inline"
            title="Damage to champions"
          >
            {Math.round((player.damage ?? 0) / 1000)}k
          </span>
        </>
      ) : (
        <span className="shrink-0 text-xs text-ink-dim tabular-nums">
          {player.powerAtTime ?? "—"}
        </span>
      )}
    </li>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg border border-line bg-panel/60"
        />
      ))}
    </div>
  );
}
