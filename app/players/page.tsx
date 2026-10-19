import { Suspense } from "react";

import { ComfortBadge } from "@/components/comfort-badge";
import { EmptyState, PageHeader } from "@/components/ui";
import { listPlayers } from "@/db/queries";
import type { Player } from "@/db/schema";
import { comfortOf } from "@/lib/player";
import { ROLES } from "@/lib/types";

import { createPlayer, updatePlayer } from "./actions";
import { DeletePlayerButton } from "./delete-player-button";
import { PlayerForm } from "./player-form";

export default function PlayersPage() {
  return (
    <div>
      <PageHeader
        title="Players"
        description="Power is how good someone is overall. Role comfort only decides who plays where."
      />

      <details className="mb-6 rounded-lg border border-line bg-panel">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold select-none">
          + Add player
        </summary>
        <div className="border-t border-line p-4">
          <PlayerForm action={createPlayer} submitLabel="Add player" resetOnSuccess />
        </div>
      </details>

      <Suspense fallback={<RosterSkeleton />}>
        <Roster />
      </Suspense>
    </div>
  );
}

async function Roster() {
  const everyone = await listPlayers();
  const active = everyone.filter((player) => !player.archived);
  const retired = everyone.filter((player) => player.archived);

  if (everyone.length === 0) {
    return <EmptyState>No players yet. Add the first one above.</EmptyState>;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-ink-dim uppercase">
          {active.length} active
        </h2>
        {active.length === 0 ? (
          <EmptyState>Everyone is retired.</EmptyState>
        ) : (
          active.map((player) => <PlayerRow key={player.id} player={player} />)
        )}
      </section>

      {retired.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-ink-dim uppercase">
            {retired.length} retired
          </h2>
          {retired.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PlayerRow({ player }: { player: Player }) {
  const updateThisPlayer = updatePlayer.bind(null, player.id);

  return (
    <details
      className={`group rounded-lg border border-line bg-panel ${
        player.archived ? "opacity-60" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 select-none">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-semibold text-gold">
          {player.power}
        </span>

        <span className="mr-auto font-medium">{player.name}</span>

        <span className="flex flex-wrap gap-1">
          {ROLES.map((role) => (
            <ComfortBadge key={role} role={role} comfort={comfortOf(player, role)} />
          ))}
        </span>

        <span className="text-xs text-ink-dim group-open:hidden">Edit</span>
      </summary>

      <div className="border-t border-line p-4">
        <PlayerForm
          action={updateThisPlayer}
          player={player}
          submitLabel="Save changes"
          extraActions={<DeletePlayerButton id={player.id} name={player.name} />}
        />
      </div>
    </details>
  );
}

function RosterSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg border border-line bg-panel/60"
        />
      ))}
    </div>
  );
}
