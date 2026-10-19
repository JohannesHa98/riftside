import { Suspense } from "react";

import { EmptyState, PageHeader } from "@/components/ui";
import { listActivePlayers } from "@/db/queries";
import { PLAYERS_PER_GAME } from "@/lib/balance";
import { toBalancePlayer } from "@/lib/player";

import { TeamPicker } from "./team-picker";

export default function NewGamePage() {
  return (
    <div>
      <PageHeader
        title="New game"
        description="Pick ten players. Roles are a suggestion — sort them out among yourselves."
      />

      <Suspense fallback={<RosterSkeleton />}>
        <Picker />
      </Suspense>
    </div>
  );
}

async function Picker() {
  const roster = (await listActivePlayers()).map(toBalancePlayer);

  if (roster.length < PLAYERS_PER_GAME) {
    return (
      <EmptyState>
        {roster.length} active {roster.length === 1 ? "player" : "players"} so far.
        You need {PLAYERS_PER_GAME} before you can split teams.
      </EmptyState>
    );
  }

  return <TeamPicker roster={roster} />;
}

function RosterSkeleton() {
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg border border-line bg-panel/60"
        />
      ))}
    </div>
  );
}
