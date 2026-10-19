import { Suspense } from "react";

import { EmptyState, PageHeader } from "@/components/ui";
import {
  listMatches,
  totalPower,
  type MatchParticipant,
  type MatchSummary,
} from "@/db/queries";
import { ROLE_LABELS, type Team } from "@/lib/types";

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
  const matches = await listMatches();

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
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}

function MatchCard({ match }: { match: MatchSummary }) {
  return (
    <details className="rounded-lg border border-line bg-panel">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 select-none">
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

        <span className="ml-auto text-xs text-ink-dim">Line-ups</span>
      </summary>

      <div className="border-t border-line p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Lineup side="blue" players={match.blue} winner={match.winner} />
          <Lineup side="red" players={match.red} winner={match.winner} />
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <WinnerButtons matchId={match.id} winner={match.winner} />
        </div>
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
}: {
  side: Team;
  players: MatchParticipant[];
  winner: Team | null;
}) {
  const colour = side === "blue" ? "text-blue-side" : "text-red-side";
  const label = side === "blue" ? "Blue side" : "Red side";

  return (
    <section>
      <h3 className={`mb-1 text-xs font-semibold uppercase ${colour}`}>
        {label}
        {winner === side ? <span className="ml-1 text-good">won</span> : null}
      </h3>

      <ul className="space-y-1">
        {players.map((player) => (
          <li key={player.playerId} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-xs text-ink-dim">
              {player.role ? ROLE_LABELS[player.role] : "—"}
            </span>
            <span className="mr-auto truncate">{player.name}</span>
            <span className="text-xs text-ink-dim tabular-nums">
              {player.powerAtTime}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
